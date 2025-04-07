import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Room } from 'src/rooms/entities/room.entity';

@Entity()
export class RoomUser {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, user => user.rooms)
  user: User;

  @ManyToOne(() => Room, room => room.participants)
  room: Room;
  
  @Column({ type: 'text', nullable: true })
  diagram_data: string; // Aquí almacenamos el XML o JSON del diagrama
  
}

