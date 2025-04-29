// src/export/export.module.ts
import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Room } from 'src/rooms/entities/room.entity'; // importa Room

@Module({
  imports: [TypeOrmModule.forFeature([Room])], // <-- aquí importa Room
  providers: [ExportService],
  controllers: [ExportController]
})
export class ExportModule {}
