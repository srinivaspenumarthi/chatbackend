import { v4 as uuidv4 } from 'uuid';
import { Room, GetTypesResult } from './types';
import { Server, Socket } from 'socket.io';

/**
 * Handles matchmaking: assigns the socket to a new or existing room
 */
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

    const updatedRoom: Room = {
      ...availableRoom.room,
      isAvailable: false,
      p2: { id: socket.id }
    };

    rooms.set(availableRoom.roomId, updatedRoom);

    // Notify both parties of the match
    io.to(updatedRoom.p1.id!).emit('remote-socket', socket.id);
    socket.emit('remote-socket', updatedRoom.p1.id);
    socket.emit('roomid', availableRoom.roomId);
  } else {
    // Create new room as p1
    const roomId = uuidv4();
    const newRoom: Room = {
      roomId,
      isAvailable: true,
      p1: { id: socket.id },
      p2: { id: null }
    };

    rooms.set(roomId, newRoom);
    socket.join(roomId);
    cb('p1');
    socket.emit('roomid', roomId);
  }
}

/**
 * Handles cleanup when a socket disconnects
 */
export function handleDisconnect(
  disconnectedId: string,
  rooms: Map<string, Room>,
  io: Server
): void {
  for (const [roomId, room] of rooms.entries()) {
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
  }
}

/**
 * Identifies whether the socket is p1 or p2 and returns their counterpart
 */
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

/**
 * Finds an available room where someone is waiting
 */
function findAvailableRoom(
  rooms: Map<string, Room>,
  socketId: string
): { roomId: string; room: Room } | null {
  for (const [roomId, room] of rooms.entries()) {
    if (room.isAvailable && room.p1.id !== socketId) {
      return { roomId, room };
    }
  }
  return null;
}
