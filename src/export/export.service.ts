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
  ) {}

  async exportRoomAsAngular(roomCode: string): Promise<string> {
    const room = await this.roomRepository.findOneBy({ code: roomCode });
    if (!room || !room.canvasFile) {
      throw new Error(`No existe canvas para la sala: ${roomCode}`);
    }

    // 🚨 Parsear JSON correctamente
    const parsed = JSON.parse(room.canvasFile);
    let pages: any[] = [];

    if (Array.isArray(parsed)) {
      // Soporte para JSON viejo (sin estructura de páginas)
      pages = [{ id: 'default', name: 'Página 1', components: parsed }];
    } else if (parsed.pages && Array.isArray(parsed.pages)) {
      // JSON moderno con estructura de páginas
      pages = parsed.pages;
    } else if (parsed.components && Array.isArray(parsed.components)) {
      // Soporte para objetos con propiedad components directa
      pages = [{ id: 'default', name: 'Página 1', components: parsed.components }];
    } else {
      throw new Error('El canvasFile no contiene un formato válido de páginas.');
    }

    // Validar que cada página tenga componentes
    pages = pages.filter(page => Array.isArray(page.components));

    const roomExportPath = path.join(this.exportTmpPath, `angular-${roomCode}`);
    fs.rmSync(roomExportPath, { recursive: true, force: true });
    fs.cpSync(this.templatePath, roomExportPath, { recursive: true });

    const pagesDir = path.join(roomExportPath, 'src', 'app', 'pages');
    await mkdirAsync(pagesDir, { recursive: true });

    let imports = '';
    let routes = '';

    for (const page of pages) {
      const pageFolder = path.join(pagesDir, `page-${page.id}`);
      await mkdirAsync(pageFolder, { recursive: true });

      const htmlPath = path.join(pageFolder, `page-${page.id}.component.html`);
      const tsPath = path.join(pageFolder, `page-${page.id}.component.ts`);

      const htmlContent = this.convertComponentsToHtml(page.components);
      await writeFileAsync(htmlPath, htmlContent);
      await writeFileAsync(tsPath, this.generateComponentTs(page.id));

      const normalizedId = this.normalizeId(page.id);
      imports += `import { Page${normalizedId}Component } from './pages/page-${page.id}/page-${page.id}.component';\n`;
      routes += `  { path: '${page.name.toLowerCase().replace(/\s+/g, '-')}', component: Page${normalizedId}Component },\n`;
    }

    // Actualizar rutas
    const routesPath = path.join(roomExportPath, 'src', 'app', 'app.routes.ts');
    let routesContent = await readFileAsync(routesPath, 'utf8');

    if (!routesContent.includes(imports)) {
      routesContent = imports + '\n' + routesContent;
      routesContent = routesContent.replace(
        'export const routes: Routes = [',
        `export const routes: Routes = [\n${routes}`
      );
      await writeFileAsync(routesPath, routesContent);
    }

    const zipPath = path.join(this.exportTmpPath, `angular-${roomCode}.zip`);
    await this.zipDirectory(roomExportPath, zipPath);

    return zipPath;
  }

  private convertComponentsToHtml(components: any[]): string {
    const render = (comp: any): string => {
      const tag = comp.type || 'div';
      const styleEntries = Object.entries(comp.style || {}).map(([k, v]) => {
        const kebabKey = k.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${kebabKey}: ${v}`;
      });
      const style = styleEntries.join('; ');
      const content = comp.content || '';
      const children = (comp.children || []).map(render).join('');
      return `<${tag} style="${style}">${content}${children}</${tag}>`;
    };

    return `<div style="position: relative; width: 100%; height: 100vh;">\n${components.map(render).join('\n')}\n</div>`;
  }

  private generateComponentTs(pageId: string): string {
    return `import { Component } from '@angular/core';

@Component({
  selector: 'app-page-${pageId}',
  templateUrl: './page-${pageId}.component.html',
  styleUrls: []
})
export class Page${this.normalizeId(pageId)}Component {}
`;
  }

  private normalizeId(id: string): string {
    return id.replace(/-/g, '');
  }

  private async zipDirectory(source: string, out: string): Promise<void> {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);

    return new Promise((resolve, reject) => {
      archive.directory(source, false).on('error', err => reject(err)).pipe(stream);
      stream.on('close', () => resolve());
      archive.finalize();
    });
  }
}
