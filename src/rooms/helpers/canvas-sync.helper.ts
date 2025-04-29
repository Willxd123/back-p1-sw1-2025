
import { Injectable } from '@nestjs/common';
import { CanvasStorageService } from '../canvas-storage.service';

@Injectable()
export class CanvasSyncHelper {
  private roomStates: Map<string, any[]> = new Map();

  constructor(private readonly canvasStorage: CanvasStorageService) {}

  async getRoomState(roomCode: string): Promise<any[]> {
    if (!this.roomStates.has(roomCode)) {
      const pages = await this.canvasStorage.loadCanvas(roomCode);
      this.roomStates.set(roomCode, pages);
    }
    return this.roomStates.get(roomCode);
  }

  async updateRoomState(
    roomCode: string,
    updater: (pages: any[]) => void,
    options: { broadcast?: boolean } = { broadcast: true }
  ) {
    const pages = await this.getRoomState(roomCode);
    const clonedPages = JSON.parse(JSON.stringify(pages)); // Deep clone
    updater(clonedPages);
    this.roomStates.set(roomCode, clonedPages);
    await this.canvasStorage.saveCanvas(roomCode, clonedPages);
  }
}
