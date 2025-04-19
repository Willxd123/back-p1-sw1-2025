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
import { CanvasStorageService } from './canvas-storage.service';
import { CanvasSyncHelper } from './helpers/canvas-sync.helper';

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
    private readonly canvasStorage: CanvasStorageService,
    private readonly canvasSync: CanvasSyncHelper
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


      this.server.to(roomCode).emit('newUserJoined', { email: user.email });
      // Enviar el diagrama almacenado al cliente
      // Cargar el canvas existente y enviarlo al nuevo usuario
      const components = await this.canvasStorage.loadCanvas(roomCode);
      if (components.length > 0) {
        client.emit('initialCanvasLoad', components);
      }
      // Obtener la lista de usuarios conectados y emitir a todos
      const usersInRoom =
        await this.getUsersInRoomWithConnectionStatus(roomCode);
      this.server.to(roomCode).emit('updateUsersList', usersInRoom);

      client.emit('joinedRoom', room);


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
  // Agrega este nuevo método para guardar el estado
  private async saveCanvasState(roomCode: string, components: any[]) {
    try {
      await this.canvasStorage.saveCanvas(roomCode, components);
      console.log(`Canvas guardado para sala ${roomCode}`);
    } catch (error) {
      console.error(`Error guardando canvas para ${roomCode}:`, error);
    }
  }
  private findComponentInArray(components: any[], componentId: string): any | null {
    for (const component of components) {
      if (component.id === componentId) return component;
      if (component.children) {
        const found = this.findComponentInArray(component.children, componentId);
        if (found) return found;
      }
    }
    return null;
  }

  private removeComponentFromArray(components: any[], componentId: string): boolean {
    const index = components.findIndex(c => c.id === componentId);
    if (index !== -1) {
      components.splice(index, 1);
      return true;
    }

    for (const component of components) {
      if (component.children && this.removeComponentFromArray(component.children, componentId)) {
        return true;
      }
    }

    return false;
  }
  //agregar componentes
  @SubscribeMessage('addComponent')
  async handleAddComponent( // Añade async aquí
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; component: any },
  ) {
    try {
      const { roomCode, component } = data;
      const user = client.data.user;

      // Broadcast the component to all clients in the room except the sender
      client.to(roomCode).emit('componentAdded', component);

      // Guardar el nuevo estado (usa await)
      await this.canvasSync.updateRoomState(roomCode, (components) => {
        components.push(component);
      });

      console.log(`User ${user.email} added component in room: ${roomCode}`);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  //agrega hijo
  @SubscribeMessage('addChildComponent')
  async handleAddChildComponent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; parentId: string; childComponent: any },
  ) {
    try {
      const { roomCode, parentId, childComponent } = data;
      const user = client.data.user;

      await this.canvasSync.updateRoomState(roomCode, (components) => {
        const parent = this.findComponentInArray(components, parentId);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(childComponent);
        }
      });

      // Broadcast the new child
      client.to(roomCode).emit('childComponentAdded', { parentId, childComponent });

      console.log(`User ${user.email} added child component to ${parentId} in room: ${roomCode}`);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  //remover
  @SubscribeMessage('removeComponent')
  async handleRemoveComponent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; componentId: string },
  ) {
    try {
      const { roomCode, componentId } = data;
      const user = client.data.user;

      await this.canvasSync.updateRoomState(roomCode, (components) => {
        this.removeComponentFromArray(components, componentId);
        client.to(roomCode).emit('componentRemoved', componentId);
      });

      console.log(`User ${user.email} removed component ${componentId} in room: ${roomCode}`);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }
  //movimiento
  // Agrega estos manejadores al RoomsGateway

  @SubscribeMessage('moveComponent')
  async handleMoveComponent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; componentId: string; newPosition: { left: string, top: string } },
  ) {
    try {
      const { roomCode, componentId, newPosition } = data;
      const user = client.data.user;

      await this.canvasSync.updateRoomState(roomCode, (components) => {
        const component = this.findComponentInArray(components, componentId);
        if (component) {
          component.style.left = newPosition.left;
          component.style.top = newPosition.top;
          client.to(roomCode).emit('componentMoved', { componentId, newPosition });
        }
      });

      console.log(`User ${user.email} moved component ${componentId} in room: ${roomCode}`);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('transformComponent')
  async handleTransformComponent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; componentId: string; newSize: { width: string, height: string } },
  ) {
    try {
      const { roomCode, componentId, newSize } = data;
      const user = client.data.user;

      await this.canvasSync.updateRoomState(roomCode, (components) => {
        const component = this.findComponentInArray(components, componentId);
        if (component) {
          component.style.width = newSize.width;
          component.style.height = newSize.height;
          client.to(roomCode).emit('componentTransformed', { componentId, newSize });
        }
      });

      console.log(`User ${user.email} resized component ${componentId} in room: ${roomCode}`);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('updateComponentStyle')
  async handleUpdateComponentStyle(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; componentId: string; styleUpdates: any },
  ) {
    try {
      const { roomCode, componentId, styleUpdates } = data;
      const user = client.data.user;

      await this.canvasSync.updateRoomState(roomCode, (components) => {
        const component = this.findComponentInArray(components, componentId);
        if (component) {
          Object.assign(component.style, styleUpdates);
          client.to(roomCode).emit('componentStyleUpdated', { componentId, styleUpdates });
        }
      });

      console.log(`User ${user.email} updated styles for component ${componentId} in room: ${roomCode}`);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('updateComponentProperties')
  async handleUpdateComponentProperties(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; componentId: string; updates: any },
  ) {
    try {
      const { roomCode, componentId, updates } = data;
      
      await this.canvasSync.updateRoomState(roomCode, (components) => {
        const component = this.findComponentInArray(components, componentId);
        if (component) {
          if (!component.style) component.style = {};
          
          // Aplica las actualizaciones
          Object.keys(updates).forEach(key => {
            if (key === 'content') {
              component.content = updates[key];
            } else {
              component.style[key] = updates[key];
            }
          });
  
          // Emitir a TODOS los clientes (incluyendo el que originó el cambio)
          this.server.to(roomCode).emit('componentPropertiesUpdated', {
            componentId,
            updates
          });
        }
      });
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

}