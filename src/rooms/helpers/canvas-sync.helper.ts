// src/rooms/helpers/canvas-sync.helper.ts
import { Injectable } from '@nestjs/common';
import { CanvasStorageService } from '../canvas-storage.service';

@Injectable()
export class CanvasSyncHelper {
  private roomStates: Map<string, any[]> = new Map();

  constructor(private readonly canvasStorage: CanvasStorageService) {}

  async getRoomState(roomCode: string): Promise<any[]> {
    if (!this.roomStates.has(roomCode)) {
      const components = await this.canvasStorage.loadCanvas(roomCode);
      this.roomStates.set(roomCode, components);
    }
    return this.roomStates.get(roomCode);
  }

  async updateRoomState(
    roomCode: string, 
    updater: (components: any[]) => void,
    options: { broadcast?: boolean } = { broadcast: true }
  ) {
    const components = await this.getRoomState(roomCode);
    const clonedComponents = JSON.parse(JSON.stringify(components)); // Deep clone
    updater(clonedComponents);
    this.roomStates.set(roomCode, clonedComponents);
    await this.canvasStorage.saveCanvas(roomCode, clonedComponents);
  }
}