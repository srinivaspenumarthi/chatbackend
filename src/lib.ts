import { v4 as uuidv4 } from 'uuid';
import { Room, GetTypesResult } from './types';
import { Server, Socket } from 'socket.io';

export function handleStart(
  rooms: Map<string, Room>,
  socket: Socket,
  cb: (type: 'p1' | 'p2') => void,
  io: Server
): void {
  const availableRoom = findAvailableRoom(rooms, socket.id);

  if (availableRoom) {
    // Join as p2
    socket.join(availableRoom.roomId);
    cb('p2');
    availableRoom.room.isAvailable = false;
    availableRoom.room.p2.id = socket.id;
    rooms.set(availableRoom.roomId, availableRoom.room);

    io.to(availableRoom.room.p1.id!).emit('remote-socket', socket.id);
    socket.emit('remote-socket', availableRoom.room.p1.id);
    socket.emit('roomid', availableRoom.roomId);
  } else {
    // Create new room as p1
    const roomId = uuidv4();
    const newRoom: Room = {
      roomId,
      isAvailable: true,
      p1: { id: socket.id },
      p2: { id: null },
    };
    rooms.set(roomId, newRoom);
    socket.join(roomId);
    cb('p1');
    socket.emit('roomid', roomId);
  }
}

export function handleDisconnect(
  disconnectedId: string,
  rooms: Map<string, Room>,
  io: Server
): void {
  rooms.forEach((room, roomId) => {
    if (room.p1.id === disconnectedId) {
      if (room.p2.id) {
        io.to(room.p2.id).emit('disconnected');
        room.p1.id = room.p2.id;
        room.p2.id = null;
        room.isAvailable = true;
        rooms.set(roomId, room);
      } else {
        rooms.delete(roomId);
      }
    } else if (room.p2.id === disconnectedId) {
      if (room.p1.id) {
        io.to(room.p1.id).emit('disconnected');
        room.p2.id = null;
        room.isAvailable = true;
        rooms.set(roomId, room);
      } else {
        rooms.delete(roomId);
      }
    }
  });
}

export function getType(id: string, rooms: Map<string, Room>): GetTypesResult {
  for (const room of rooms.values()) {
    if (room.p1.id === id) {
      return { type: 'p1', p2id: room.p2.id };
    }
    if (room.p2.id === id) {
      return { type: 'p2', p1id: room.p1.id };
    }
  }
  return false;
}

function findAvailableRoom(
  rooms: Map<string, Room>,
  socketId: string
): { roomId: string; room: Room } | null {
  for (const [roomId, room] of rooms) {
    if (room.isAvailable && room.p1.id !== socketId) {
      return { roomId, room };
    }
  }
  return null;
}
