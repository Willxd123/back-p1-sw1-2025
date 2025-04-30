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
    if (!room || !room.canvasFile) throw new Error(`No existe canvas para la sala: ${roomCode}`);

    const parsed = JSON.parse(room.canvasFile);
    const pages = Array.isArray(parsed) ? parsed : parsed.pages;

    if (!Array.isArray(pages)) {
      throw new Error('El formato del canvasFile no es un array de páginas.');
    }

    const projectName = `angular-${roomCode}`;
    const roomExportPath = path.join(this.exportTmpPath, projectName);
    fs.rmSync(roomExportPath, { recursive: true, force: true });
    fs.cpSync(this.templatePath, roomExportPath, { recursive: true });

    const pagesDir = path.join(roomExportPath, 'src', 'app', 'pages');
    await mkdirAsync(pagesDir, { recursive: true });

    let imports = '';
    let routes = `  { path: '', redirectTo: '${pages[0].name.toLowerCase().replace(/\s+/g, '-')}', pathMatch: 'full' },\n`;
    let navbarLinks = '';

    for (const page of pages) {
      const pageFolder = path.join(pagesDir, `page-${page.id}`);
      await mkdirAsync(pageFolder, { recursive: true });

      const htmlPath = path.join(pageFolder, `page-${page.id}.component.html`);
      const cssPath = path.join(pageFolder, `page-${page.id}.component.css`);
      const tsPath = path.join(pageFolder, `page-${page.id}.component.ts`);

      const { html, css } = this.convertComponentsToHtmlAndCss(page.components);
      await writeFileAsync(htmlPath, html);
      await writeFileAsync(cssPath, css);
      await writeFileAsync(tsPath, this.generateComponentTs(page.id));

      const normalizedPath = page.name.toLowerCase().replace(/\s+/g, '-');
      imports += `import { Page${this.normalizeId(page.id)}Component } from './pages/page-${page.id}/page-${page.id}.component';\n`;
      routes += `  { path: '${normalizedPath}', component: Page${this.normalizeId(page.id)}Component },\n`;
      navbarLinks += `      <li><a routerLink="/${normalizedPath}" routerLinkActive="active">${page.name}</a></li>\n`;
    }

    const navbarDir = path.join(roomExportPath, 'src', 'app', 'components', 'navbar');
    await mkdirAsync(navbarDir, { recursive: true });

    await writeFileAsync(
      path.join(navbarDir, 'navbar.component.ts'),
      this.generateNavbarTs()
    );
    await writeFileAsync(
      path.join(navbarDir, 'navbar.component.html'),
      this.generateNavbarHtml(navbarLinks, roomCode)
    );
    await writeFileAsync(
      path.join(navbarDir, 'navbar.component.css'),
      this.generateNavbarCss()
    );

    const routesPath = path.join(roomExportPath, 'src', 'app', 'app.routes.ts');
    let routesContent = await readFileAsync(routesPath, 'utf8');

    routesContent = imports + '\n' + routesContent;
    routesContent = routesContent.replace(
      'export const routes: Routes = [',
      `export const routes: Routes = [\n${routes}`
    );
    await writeFileAsync(routesPath, routesContent);

    const appComponentHtmlPath = path.join(roomExportPath, 'src', 'app', 'app.component.html');
    await writeFileAsync(appComponentHtmlPath, `<app-navbar></app-navbar>\n<router-outlet></router-outlet>`);

    const appComponentTsPath = path.join(roomExportPath, 'src', 'app', 'app.component.ts');
    await writeFileAsync(appComponentTsPath, this.generateAppComponentTs());

    const zipPath = path.join(this.exportTmpPath, `${projectName}.zip`);
    await this.zipDirectory(roomExportPath, zipPath, projectName);

    return zipPath;
  }

  private convertComponentsToHtmlAndCss(components: any[]): { html: string; css: string } {
    let counter = 0;
    const cssMap = new Map<string, string>();

    const toKebabCase = (str: string): string =>
      str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

    const render = (comp: any): string => {
      const className = `c${++counter}`;
      const styleString = Object.entries(comp.style || {})
        .map(([key, val]) => `${toKebabCase(key)}: ${val};`)
        .join(' ');
      cssMap.set(className, styleString);

      const tag = comp.type || 'div';
      const content = comp.content || '';
      const children = (comp.children || []).map(render).join('');

      return `<${tag} class="${className}">${content}${children}</${tag}>`;
    };

    const html = `<div style="position: relative; width: 100%; height: 100vh;">
${components.map(render).join('\n')}
</div>`;
    const css = Array.from(cssMap.entries())
      .map(([cls, styles]) => `.${cls} {\n  ${styles}\n}`)
      .join('\n\n');

    return { html, css };
  }

  private generateComponentTs(pageId: string): string {
    return `import { Component } from '@angular/core';

@Component({
  selector: 'app-page-${pageId}',
  templateUrl: './page-${pageId}.component.html',
  styleUrls: ['./page-${pageId}.component.css']
})
export class Page${this.normalizeId(pageId)}Component {}`;
  }

  private generateNavbarTs(): string {
    return `import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent {}`;
  }

  private generateNavbarHtml(links: string, roomCode: string): string {
    return `<nav class="navbar">
  <div class="navbar-container">
    <a href="#" class="navbar-logo">
      <span>${roomCode}</span>
    </a>
    <input type="checkbox" id="menu-toggle" class="menu-toggle">
    <label for="menu-toggle" class="menu-icon">&#9776;</label>

    <ul class="navbar-menu">
${links}    </ul>
  </div>
</nav>`;
  }

  private generateNavbarCss(): string {
    return `/* Reset básico */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.navbar {
  background-color: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0.8rem 1.5rem;
}

.navbar-container {
  max-width: 1200px;
  margin: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
}

.navbar-logo {
  display: flex;
  align-items: center;
  text-decoration: none;
  color: #111827;
  font-size: 1.6rem;
  font-weight: 600;
}

.navbar-menu {
  list-style: none;
  display: flex;
  gap: 2rem;
}

.navbar-menu li a {
  text-decoration: none;
  color: #374151;
  padding: 0.5rem;
  transition: all 0.3s ease;
  border-radius: 4px;
  font-weight: 600;
}

.navbar-menu li a:hover {
  background-color: #f3f4f6;
  color: #2563eb;
}

.navbar-menu li a.active {
  background-color: #2563eb;
  color: #ffffff;
}

.menu-icon {
  display: none;
  font-size: 2rem;
  cursor: pointer;
}

.menu-toggle {
  display: none;
}

@media (max-width: 768px) {
  .menu-icon {
    display: block;
  }

  .navbar-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background-color: #ffffff;
    flex-direction: column;
    align-items: center;
    overflow: hidden;
    max-height: 0;
    transition: max-height 0.4s ease;
    border-bottom: 1px solid #e5e7eb;
  }

  .menu-toggle:checked + .menu-icon + .navbar-menu {
    max-height: 500px;
  }

  .navbar-menu li {
    width: 100%;
    text-align: center;
    margin: 0.5rem 0;
  }
}`;
  }

  private generateAppComponentTs(): string {
    return `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'export';
}`;
  }

  private normalizeId(id: string): string {
    return id.replace(/-/g, '');
  }

  private async zipDirectory(source: string, out: string, folderName: string): Promise<void> {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);

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
