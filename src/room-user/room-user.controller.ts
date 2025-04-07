import { Controller, Post, Body, Get, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { RoomUserService } from './room-user.service';
import { CreateRoomUserDto } from './dto/create-room-user.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/rol.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { UserActiveInterface } from 'src/common/interfaces/user-active.interface';
import { AuthGuard } from 'src/auth/guard/auth.guard';

@Controller('room-user')
@UseGuards(AuthGuard)  // Asegurarse de que el usuario esté autenticado
export class RoomUserController {
  constructor(private readonly roomUserService: RoomUserService) {}

  // Endpoint para unirse a una sala
  // Método POST para unirse a una sala por código
  @Post('join')
  async joinRoomByCode(
    @Body('code') roomCode: string,
    @ActiveUser() user: UserActiveInterface
  ) {
    return this.roomUserService.joinRoomByCode(roomCode, user.id);
  }
  @Get(':roomId')
  findUsersInRoom(@Param('roomId') roomId: number) {
    return this.roomUserService.findUsersInRoom(roomId);
  }
  // Endpoint GET para obtener todas las salas según el ID del usuario autenticado
  @Get('my-rooms')
  async findRoomsByUserId(@ActiveUser() user: UserActiveInterface) {
    return this.roomUserService.findRoomsByUserId(user.id);
  }
  @Get()
  async findAll() {
    return this.roomUserService.findAll();
  }
  // Endpoint GET para obtener un RoomUser por su ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roomUserService.findOne(id);
  }
  
}
