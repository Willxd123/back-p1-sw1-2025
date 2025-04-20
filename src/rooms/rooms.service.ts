import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './entities/room.entity';
import { RoomUser } from 'src/room-user/entities/room-user.entity';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { User } from 'src/users/entities/user.entity';
import { UserActiveInterface } from 'src/common/interfaces/user-active.interface';
import * as fs from 'fs';
import { writeFile, mkdir, access, constants } from 'fs/promises';
import * as path from 'path';

import { CanvasStorageService } from './canvas-storage.service';
import { CanvasSyncHelper } from './helpers/canvas-sync.helper';
@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RoomUser)
    private readonly roomUserRepository: Repository<RoomUser>,
    private readonly canvasStorage: CanvasStorageService,
    private readonly canvasSync: CanvasSyncHelper
  ) { }
  //-----------------------------------------
  async getCanvasState(roomCode: string): Promise<any[]> {
    return this.canvasSync.getRoomState(roomCode);
  }

  async updateCanvasState(roomCode: string, updater: (components: any[]) => void) {
    await this.canvasSync.updateRoomState(roomCode, updater);
  }
  //leer y escrbir archivos;
  

  // Renombrar el método a 'create' para que coincida con el controller
  async create(createRoomDto: CreateRoomDto, user: UserActiveInterface) {
    const { name } = createRoomDto;

    // Buscar el usuario autenticado usando su email o ID desde el token
    const creator = await this.userRepository.findOneBy({ email: user.email });
    if (!creator) {
      throw new Error('User not found');
    }

    // Crear el código único para la sala
    const code = this.generateUniqueCode();

    // Crear la sala
    const room = this.roomRepository.create({
      name,
      code,
      creator, // Relacionamos la sala con el usuario creador
    });

    // Guardar la sala en la base de datos
    const newRoom = await this.roomRepository.save(room);

    // Agregar al creador como participante en la sala
    const roomUser = this.roomUserRepository.create({
      user: creator,
      room: newRoom,
    });
    await this.roomUserRepository.save(roomUser);

    return newRoom;
  }

  // Buscar sala por código
  async findByCode(code: string) {
    return this.roomRepository.findOne({
      where: { code },
      relations: ['participants'],
    });
  }

  // Implementar findAll
  async findAll() {
    return this.roomRepository.find();
  }

  // Implementar findOne
  async findOne(id: number) {
    return this.roomRepository.findOneBy({ id });
  }

  // Implementar update
  async update(id: number, updateRoomDto: UpdateRoomDto) {
    const room = await this.roomRepository.findOneBy({ id });
    if (!room) {
      throw new Error('Room not found');
    }
    room.name = updateRoomDto.name;
    return this.roomRepository.save(room);
  }

  // Implementar remove
  async remove(id: number) {
    const room = await this.roomRepository.findOneBy({ id });
    if (!room) {
      throw new Error('Room not found');
    }
    return this.roomRepository.remove(room);
  }
  //
  // Obtener todos los usuarios de una sala (incluidos conectados y desconectados)

  async getAllUsersInRoom(roomCode: string) {
    // Obtén la sala por su código, incluyendo la relación con los usuarios
    const room = await this.roomRepository.findOne({
      where: { code: roomCode },
      relations: ['participants', 'participants.user'], // Asegúrate de incluir los usuarios
    });

    if (!room) {
      throw new Error('Sala no encontrada');
    }

    // Mapear la lista de usuarios para devolver su email y estado de conexión
    const allUsers = room.participants.map((participant) => ({
      email: participant.user.email,
      name: participant.user.name,
      isConnected: false, // Inicialmente, asumimos que están desconectados
    }));

    return allUsers;
  }
  //generador de las sala unica
  private generateUniqueCode(): string {
    return Math.random().toString(36).substr(2, 4).toUpperCase(); // Código único de sala
  }
  //------------------------
  async findRoomUser(userId: number, roomId: number) {
    return await this.roomUserRepository.findOne({
      where: { user: { id: userId }, room: { id: roomId } },
    });
  }

  async addUserToRoom(userId: number, roomId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const room = await this.roomRepository.findOne({ where: { id: roomId } });

    if (!user || !room) {
      throw new Error('Usuario o sala no encontrados');
    }

    const roomUser = this.roomUserRepository.create({
      user,
      room,
    });

    await this.roomUserRepository.save(roomUser);
  }

  async findRoomByCode(roomCode: string): Promise<Room> {
    return await this.roomRepository.findOne({ where: { code: roomCode } });
  }
  async getUserRooms(user: UserActiveInterface) {
    const userEntity = await this.userRepository.findOne({
      where: { email: user.email },
      relations: ['createdRooms', 'rooms', 'rooms.room'],
    });

    if (!userEntity) {
      throw new Error('Usuario no encontrado');
    }

    // Obtenemos las salas que ha creado el usuario
    const createdRooms = userEntity.createdRooms;

    // Obtenemos las salas donde el usuario es un participante (relación RoomUser)
    const participantRooms = userEntity.rooms.map(roomUser => roomUser.room);

    // Unimos ambas listas
    const allRooms = [...createdRooms, ...participantRooms];

    // Devolvemos solo las salas relacionadas con el usuario
    return allRooms;
  }

}