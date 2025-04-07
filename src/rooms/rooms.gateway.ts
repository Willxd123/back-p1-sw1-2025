import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UserActiveInterface } from 'src/common/interfaces/user-active.interface';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*', // Permitir el acceso desde cualquier origen, ajustar según sea necesario
  },
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly roomsService: RoomsService,
    private readonly jwtService: JwtService,
  ) { }

  // Verificar conexión de un cliente
  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    const user = this.jwtService.verify(token);
    client.data.user = user;
    console.log(`Usuario conectado: ${user.email}`);
  }

  // Método para manejar la desconexión de un cliente
  handleDisconnect(client: Socket) {
    const user = client.data.user;
    console.log(
      `Cliente desconectado: ${client.id}, Usuario: ${user?.email || 'desconocido'}`,
    );

    // Emite el evento de desconexión
    if (user) {
      this.server.emit('userDisconnected', { email: user.email });
    }
  }

  // Crear una nueva sala con Socket.IO
  @SubscribeMessage('createRoom')
  async handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() createRoomDto: CreateRoomDto,
  ) {
    try {
      const user = client.data.user;
      if (!user) throw new Error('Usuario no autenticado');

      const room = await this.roomsService.create(createRoomDto, user);
      client.join(room.code); // Unirse a la sala
      client.emit('roomCreated', room); // Enviar confirmación al cliente

      console.log(`Sala creada: ${room.name}, código: ${room.code}`);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  // Unirse a una sala existente
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody('roomCode') roomCode: string,
  ) {
    try {
      const user = client.data.user;
      const room = await this.roomsService.findByCode(roomCode);
      if (!room) throw new Error('Sala no encontrada');
      // Verificar si el usuario ya está en la sala
      const existingRoomUser = await this.roomsService.findRoomUser(
        user.id,
        room.id,
      );
      if (!existingRoomUser) {
        // Si no está en la sala, agregarlo como 'participant'
        await this.roomsService.addUserToRoom(user.id, room.id);
      }

      // Unirse a la sala en el socket
      client.join(roomCode);
      // ✅ Enviar objetos existentes al nuevo usuario
      const existingObjects = await this.roomsService.getObjectsInRoom(roomCode);
      client.emit('initialCanvasState', existingObjects);

      this.server.to(roomCode).emit('newUserJoined', { email: user.email });
      // Enviar el diagrama almacenado al cliente

      // Obtener la lista de usuarios conectados y emitir a todos
      const usersInRoom =
        await this.getUsersInRoomWithConnectionStatus(roomCode);
      this.server.to(roomCode).emit('updateUsersList', usersInRoom);

      client.emit('joinedRoom', room);
      console.log('📤 Enviando initialCanvasState:', existingObjects);

      console.log(`Usuario ${user.email} se unió a la sala: ${roomCode}`);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  // Obtener usuarios conectados
  private async getUsersInRoomWithConnectionStatus(roomCode: string) {
    // Obtener todos los usuarios de la base de datos
    const allUsers = await this.roomsService.getAllUsersInRoom(roomCode);

    // Obtener los usuarios actualmente conectados al socket
    const connectedClients = Array.from(
      this.server.sockets.adapter.rooms.get(roomCode) || [],
    );

    // Actualizar el estado de conexión para cada usuario
    return allUsers.map((user) => ({
      email: user.email,
      name: user.name,
      isConnected: connectedClients.some(
        (clientId) =>
          this.server.sockets.sockets.get(clientId)?.data.user.email ===
          user.email,
      ),
    }));
  }
  //salir de una sala
  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody('roomCode') roomCode: string,
  ) {
    const user = client.data.user;
    // El usuario deja la sala
    client.leave(roomCode);

    client.emit('leftRoom', { roomCode });
    // Emitir el estado desconectado y actualizar la lista
    this.server.to(roomCode).emit('userLeft', { email: user.email });
    this.getUsersInRoomWithConnectionStatus(roomCode).then((usersInRoom) => {
      this.server.to(roomCode).emit('updateUsersList', usersInRoom);
    });

    console.log(`Usuario ${user.email} salió de la sala: ${roomCode}`);
  }
  //-------------------diagrama----------------------------
  //agregar objeto
  @SubscribeMessage('addObject')
  async handleAddObject(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomCode: string; objectData: any },
  ) {
    const user = client.data.user;
    if (!user) throw new Error('Usuario no autenticado');

    const roomCode = payload.roomCode;
    const objectData = payload.objectData;

    // ✅ GUARDAR el objeto en memoria
    this.roomsService.addObjectToRoom(roomCode, objectData);

    // 🔁 Enviar a los demás usuarios de la sala
    this.server.to(roomCode).emit('objectAdded', objectData);
    console.log('📨 Evento addObject recibido:', payload);

    console.log(`Usuario ${user.email} agregó un objeto a la sala: ${roomCode}`);
  }
  //mover objeto
  @SubscribeMessage('moveObject')
  handleMoveObject(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomCode: string; objectId: string; x: number; y: number },
  ) {
    const { roomCode, objectId, x, y } = payload;

    // ✅ Actualizar objeto en memoria
    this.roomsService.updateObjectPosition(roomCode, objectId, x, y);

    // 🔁 Emitir a otros usuarios en la sala
    client.broadcast.to(roomCode).emit('objectMoved', {
      objectId,
      x,
      y,
    });

    console.log(`📦 Objeto ${objectId} movido a x:${x}, y:${y}`);
  }




}
