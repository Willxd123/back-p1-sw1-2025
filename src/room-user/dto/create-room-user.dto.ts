import { IsString } from 'class-validator';

export class CreateRoomUserDto {
  @IsString()
  code: string;  ;
}
