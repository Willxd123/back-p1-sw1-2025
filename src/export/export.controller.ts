import { Controller, Get, Param, Res } from '@nestjs/common';
import { ExportService } from './export.service';
import { Response } from 'express';
import * as path from 'path';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('angular/:roomCode')
  async exportAngular(@Param('roomCode') roomCode: string, @Res() res: Response) {
    try {
      const zipPath = await this.exportService.exportRoomAsAngular(roomCode);
      res.download(zipPath, `proyecto-${roomCode}.zip`);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
}
