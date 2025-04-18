import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { Room } from './entities/room.entity';
import { UsersModule } from '../users/users.module';  // Verifica que esta ruta sea correcta
import { AuthModule } from '../auth/auth.module';  // Verifica que esta ruta sea correcta
import { RoomUser } from 'src/room-user/entities/room-user.entity';
import { RoomsGateway } from './rooms.gateway';
import { RoomUserModule } from 'src/room-user/room-user.module';
import { CanvasSyncHelper } from './helpers/canvas-sync.helper';
import { CanvasStorageService } from './canvas-storage.service';


@Module({
  imports: [
    TypeOrmModule.forFeature([Room, RoomUser]),
    forwardRef(() => UsersModule),  // Si hay una dependencia circular con UsersModule
    forwardRef(() => AuthModule),   // Si hay una dependencia circular con AuthModule
    RoomUserModule, // Importa RoomUserModule
  ],
  providers: [RoomsService, RoomsGateway, CanvasStorageService, // Añade estos nuevos providers
    CanvasSyncHelper],
  controllers: [RoomsController],
  exports: [RoomsService, RoomsGateway], // Exportar RoomsGateway para que otros módulos lo usen
})
export class RoomsModule { }
