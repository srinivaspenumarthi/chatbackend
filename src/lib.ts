import { v4 as uuidv4 } from 'uuid';
import { Room, GetTypesResult } from './types';
import { Server, Socket } from 'socket.io';

/**
 * Removes a socket from any existing room before rematching.
 */
export function removeSocketFromRooms(
  socketId: string,
  rooms: Map<string, Room>,
  io?: Server,
  eventName: 'disconnected' | 'skipped' = 'disconnected'
): void {
  for (const [roomId, room] of rooms.entries()) {
    if (room.p1.id !== socketId && room.p2.id !== socketId) {
      continue;
    }

    const participantIds = [room.p1.id, room.p2.id].filter((id): id is string => Boolean(id));
    const otherId = room.p1.id === socketId ? room.p2.id : room.p1.id;
    rooms.delete(roomId);

    if (io) {
      participantIds.forEach((participantId) => {
        io.sockets.sockets.get(participantId)?.leave(roomId);
      });
    }

    if (otherId && io) {
      io.to(otherId).emit(eventName);
    }

    return;
  }
}

/**
 * Handles matchmaking: assigns the socket to a new or existing room.
 */
export function handleStart(
  rooms: Map<string, Room>,
  socket: Socket,
  cb: (type: 'p1' | 'p2') => void,
  io: Server
): void {
  removeSocketFromRooms(socket.id, rooms);
  leaveStaleRooms(socket);

  const availableRoom = findAvailableRoom(rooms, socket.id);

  if (availableRoom) {
    socket.join(availableRoom.roomId);
    cb('p2');

    const updatedRoom: Room = {
      ...availableRoom.room,
      isAvailable: false,
      p2: { id: socket.id }
    };

    rooms.set(availableRoom.roomId, updatedRoom);

    io.to(updatedRoom.p1.id!).emit('remote-socket', socket.id);
    socket.emit('remote-socket', updatedRoom.p1.id);
    io.to(updatedRoom.roomId).emit('roomid', availableRoom.roomId);
    return;
  }

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

/**
 * Handles cleanup when a socket disconnects.
 */
export function handleDisconnect(
  disconnectedId: string,
  rooms: Map<string, Room>,
  io: Server
): void {
  removeSocketFromRooms(disconnectedId, rooms, io, 'disconnected');
}

/**
 * Identifies whether the socket is p1 or p2 and returns their counterpart.
 */
export function getType(id: string, rooms: Map<string, Room>): GetTypesResult {
  for (const room of rooms.values()) {
    if (room.p1.id === id) {
      return { type: 'p1', p2id: room.p2.id, roomId: room.roomId };
    }
    if (room.p2.id === id) {
      return { type: 'p2', p1id: room.p1.id, roomId: room.roomId };
    }
  }
  return false;
}

/**
 * Finds an available room where someone is waiting.
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

function leaveStaleRooms(socket: Socket): void {
  socket.rooms.forEach((roomId) => {
    if (roomId !== socket.id) {
      socket.leave(roomId);
    }
  });
}
