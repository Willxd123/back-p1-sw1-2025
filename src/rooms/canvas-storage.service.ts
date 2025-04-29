// src/rooms/canvas-storage.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Room } from './entities/room.entity';
import { Repository } from 'typeorm';

@Injectable()
export class CanvasStorageService {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
  ) {}

  async saveCanvas(roomCode: string, components: any[]) {
    const room = await this.roomRepository.findOneBy({ code: roomCode });
    if (!room) throw new Error('Room not found');

    const data = {
      roomCode,
      lastUpdated: new Date().toISOString(),
      components,
    };

    room.canvasFile = JSON.stringify(data);
    await this.roomRepository.save(room);
  }

  async loadCanvas(roomCode: string): Promise<any[]> {
    const room = await this.roomRepository.findOneBy({ code: roomCode });
    if (!room || !room.canvasFile) {
      return [];
    }

    try {
      const parsed = JSON.parse(room.canvasFile);
      return parsed.components || [];
    } catch (error) {
      console.error('Error parsing canvasFile:', error);
      return [];
    }
  }
}
