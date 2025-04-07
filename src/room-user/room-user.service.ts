import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomUser } from './entities/room-user.entity';
import { User } from 'src/users/entities/user.entity';
import { Room } from 'src/rooms/entities/room.entity';
import { CreateRoomUserDto } from './dto/create-room-user.dto';
import { UserActiveInterface } from 'src/common/interfaces/user-active.interface';

@Injectable()
export class RoomUserService {
  constructor(
    @InjectRepository(RoomUser)
    private readonly roomUserRepository: Repository<RoomUser>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
  ) {}

  // Método para que un usuario se una a una sala usando el código
  async joinRoomByCode(code: string, userId: number) {
    // Verificar si la sala existe usando el código
    const room = await this.roomRepository.findOne({
      where: { code },
    });

    if (!room) {
      throw new NotFoundException('Sala no encontrada');
    }

    // Verificar si el usuario ya está en la sala
    const existingRoomUser = await this.roomUserRepository.findOne({
      where: { room: { id: room.id }, user: { id: userId } },
    });

    if (existingRoomUser) {
      // Si el usuario ya está en la sala, solo devolvemos la sala
      return { message: 'Ya estás en la sala', room };
    }

    // Buscar el usuario por su `id`
    const foundUser = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!foundUser) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Agregar al usuario a la sala si es la primera vez que entra
    const roomUser = this.roomUserRepository.create({
      room,
      user: foundUser,
    });

    await this.roomUserRepository.save(roomUser);

    return { message: 'Usuario agregado a la sala exitosamente', room };
  }

  // Método para obtener todas las salas según el ID del usuario autenticado
  async findRoomsByUserId(userId: number) {
    // Obtener las salas creadas por el usuario
    const createdRooms = await this.roomRepository.find({
      where: { creator: { id: userId } }, // Filtra por las salas creadas por el usuario
      relations: ['participants'], // Cargar los participantes
    });

    // Obtener las salas a las que el usuario se ha unido
    const joinedRooms = await this.roomUserRepository.find({
      where: { user: { id: userId } }, // Filtra las relaciones RoomUser según el ID del usuario
      relations: ['room', 'room.participants'], // Cargar las salas y sus participantes
    });

    // Combinar las salas creadas y a las que el usuario se ha unido
    const combinedRooms = [
      ...createdRooms.map((room) => ({
        name: room.name,
        code: room.code,
        participants: room.participants.map((p) => p.user),
        created: true, // Indicador de que el usuario creó esta sala
      })),
      ...joinedRooms.map((roomUser) => ({
        name: roomUser.room.name,
        code: roomUser.room.code,
        participants: roomUser.room.participants.map((p) => p.user),
        created: false, // Indicador de que el usuario se unió a esta sala
      })),
    ];

    return combinedRooms;
  }

  // Método para obtener todos los RoomUser
  async findAll(): Promise<RoomUser[]> {
    return this.roomUserRepository.find({
      relations: ['user', 'room'], // Cargar relaciones con User y Room si es necesario
    });
  }
  // Método para obtener un RoomUser por su ID
  async findOne(id: number): Promise<RoomUser> {
    const roomUser = await this.roomUserRepository.findOne({
      where: { id },
      relations: ['user', 'room'], // Cargar relaciones con User y Room si es necesario
    });

    if (!roomUser) {
      throw new NotFoundException(`RoomUser with ID ${id} not found`);
    }

    return roomUser;
  }
  // Método para listar todos los usuarios en una sala
  async findUsersInRoom(roomId: number) {
    return this.roomUserRepository.find({
      where: { room: { id: roomId } },
      relations: ['user'],
    });
  }
   // Método para guardar el diagrama
   async saveDiagram(roomId: number, userId: number, diagramData: string) {
    const roomUser = await this.roomUserRepository.findOne({ where: { room: { id: roomId }, user: { id: userId } } });

    if (!roomUser) {
      throw new Error('No se encontró la relación usuario-sala.');
    }

    roomUser.diagram_data = diagramData; // Guardar el JSON o XML en este campo
    return this.roomUserRepository.save(roomUser); // Guardar los cambios en la base de datos
  }

  // Método para obtener el diagrama
  async getDiagram(roomId: number, userId: number) {
    const roomUser = await this.roomUserRepository.findOne({ where: { room: { id: roomId }, user: { id: userId } } });

    if (!roomUser || !roomUser.diagram_data) {
      throw new Error('No se encontró el diagrama para esta sala.');
    }

    return roomUser.diagram_data; // Retornar el JSON o XML
  }
}
