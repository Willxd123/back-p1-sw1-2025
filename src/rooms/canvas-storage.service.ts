// src/rooms/canvas-storage.service.ts
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const mkdirAsync = promisify(fs.mkdir);
const accessAsync = promisify(fs.access);

@Injectable()
export class CanvasStorageService {
    //ubicacion del archivo
  private readonly storagePath = path.join(process.cwd(), 'canvas-files');

  constructor() {
    this.ensureStorageDirectory();
  }

  private async ensureStorageDirectory() {
    try {
      await accessAsync(this.storagePath, fs.constants.F_OK);
    } catch {
      await mkdirAsync(this.storagePath, { recursive: true });
    }
  }
//ubicacion del archivo
  private getFilePath(roomCode: string): string {
    return path.join(this.storagePath, `${roomCode}.json`);
  }

  async saveCanvas(roomCode: string, components: any[]) {
    const filePath = this.getFilePath(roomCode);
    const data = {
      roomCode,
      lastUpdated: new Date().toISOString(),
      components
    };
    await writeFileAsync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  async loadCanvas(roomCode: string): Promise<any[]> {
    const filePath = this.getFilePath(roomCode);
    try {
      await accessAsync(filePath, fs.constants.F_OK);
      const data = await readFileAsync(filePath, 'utf8');
      return JSON.parse(data).components;
    } catch {
      return []; // Retorna array vacío si el archivo no existe
    }
  }
}