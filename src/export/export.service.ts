// src/export/export.service.ts
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { promisify } from 'util';
import { InjectRepository } from '@nestjs/typeorm';
import { Room } from 'src/rooms/entities/room.entity';
import { Repository } from 'typeorm';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

@Injectable()
export class ExportService {
  templatePath = path.join(process.cwd(), 'export', 'templates', 'angular');
  exportTmpPath = path.join(process.cwd(), 'tmp-export');

  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
  ) { }

  async exportRoomAsAngular(roomCode: string): Promise<string> {
    // 🚨 1. Cargar desde la base de datos
    const room = await this.roomRepository.findOneBy({ code: roomCode });
    if (!room || !room.canvasFile) throw new Error(`No existe canvas para la sala: ${roomCode}`);

    const { components } = JSON.parse(room.canvasFile);

    // 🚀 2. Copiar plantilla base a temporal
    const roomExportPath = path.join(this.exportTmpPath, `angular-${roomCode}`);
    fs.rmSync(roomExportPath, { recursive: true, force: true });
    fs.cpSync(this.templatePath, roomExportPath, { recursive: true });

    // 🚀 3. Generar archivos del componente
    const htmlOutput = this.convertJsonToHtml(components);
    const pagesDir = path.join(roomExportPath, 'src', 'app', 'pages', `pages-${roomCode}`);
    await mkdirAsync(pagesDir, { recursive: true });

    const htmlPath = path.join(pagesDir, `pages-${roomCode}.component.html`);
    const tsPath = path.join(pagesDir, `pages-${roomCode}.component.ts`);

    await writeFileAsync(htmlPath, htmlOutput);
    await writeFileAsync(tsPath, this.generateComponentTs(roomCode));

    // 🚀 4. Actualizar app.routes.ts
    const routesPath = path.join(roomExportPath, 'src', 'app', 'app.routes.ts');
    let routesContent = await readFileAsync(routesPath, 'utf8');
    const importLine = `import { Pages${roomCode}Component } from './pages/pages-${roomCode}/pages-${roomCode}.component';`;

    if (!routesContent.includes(importLine)) {
      routesContent = importLine + '\n' + routesContent;
      routesContent = routesContent.replace(
        'export const routes: Routes = [',
        `export const routes: Routes = [\n  { path: '', component: Pages${roomCode}Component },`
      );
      await writeFileAsync(routesPath, routesContent);
    }

    // 🚀 5. Comprimir a zip
    const zipPath = path.join(this.exportTmpPath, `angular-${roomCode}.zip`);
    await this.zipDirectory(roomExportPath, zipPath);

    return zipPath;
  }

  private convertJsonToHtml(components: any[]): string {
    const render = (comp: any): string => {
      const tag = comp.type || 'div';
      const styleEntries = Object.entries(comp.style || {}).map(([k, v]) => {
        const kebabKey = k.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${kebabKey}: ${v}`;
      });
      const style = styleEntries.join(';');
      const content = comp.content || '';
      const children = (comp.children || []).map(render).join('');
      return `<${tag} style="${style}">${content}${children}</${tag}>`;
    };
    return `<body>\n${components.map(render).join('\n')}\n</body>`;
  }

  private generateComponentTs(roomCode: string): string {
    return `import { Component } from '@angular/core';

@Component({
  selector: 'app-pages-${roomCode}',
  templateUrl: './pages-${roomCode}.component.html',
  styleUrls: []
})
export class Pages${roomCode}Component {}
`;
  }

  private async zipDirectory(source: string, out: string): Promise<void> {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);
    const folderName = path.basename(source);

    return new Promise((resolve, reject) => {
      archive
        .directory(source, folderName)
        .on('error', err => reject(err))
        .pipe(stream);

      stream.on('close', () => resolve());
      archive.finalize();
    });
  }
}
