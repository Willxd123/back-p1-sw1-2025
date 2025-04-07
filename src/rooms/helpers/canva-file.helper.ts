import { promises as fs } from 'fs';
import * as path from 'path';

const folderPath = path.join(__dirname, '..', '..', '..', 'canvas-files');

async function ensureFolderExists() {
  try {
    await fs.mkdir(folderPath, { recursive: true });
  } catch (e) {
    console.error('Error al crear carpeta canvas-files:', e);
  }
}

export const CanvasFileHelper = {
  async save(roomCode: string, data: any) {
    await ensureFolderExists(); // ✅ Asegura que la carpeta existe

    const filePath = path.join(folderPath, `${roomCode}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  },

  async load(roomCode: string): Promise<any[]> {
    const filePath = path.join(folderPath, `${roomCode}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      return [];
    }
  },
};
