import { v4 as uuidv4 } from 'uuid';
import { Room, SessionInfo } from './types';
import { Server, Socket } from 'socket.io';

export function handleStart(
  rooms: Map<string, Room>,
  socket: Socket,
  io: Server
): void {
  removeSocketFromRooms(socket.id, rooms, io, false);
  leaveStaleRooms(socket);

  const waitingRoom = findWaitingRoom(rooms, socket.id);

  if (!waitingRoom) {
    const roomId = uuidv4();
    rooms.set(roomId, {
      roomId,
      p1Id: socket.id,
      p2Id: null,
    });
    socket.join(roomId);
    socket.emit('waiting', { roomId, type: 'p1' });
    return;
  }

  socket.join(waitingRoom.roomId);
  waitingRoom.room.p2Id = socket.id;
  rooms.set(waitingRoom.roomId, waitingRoom.room);

  io.to(waitingRoom.room.p1Id).emit('match-found', {
    roomId: waitingRoom.roomId,
    remoteSocketId: socket.id,
    type: 'p1',
  });
  socket.emit('match-found', {
    roomId: waitingRoom.roomId,
    remoteSocketId: waitingRoom.room.p1Id,
    type: 'p2',
  });
}

export function handleDisconnect(
  socketId: string,
  rooms: Map<string, Room>,
  io: Server
): void {
  removeSocketFromRooms(socketId, rooms, io, true);
}

export function handleSkip(
  socketId: string,
  rooms: Map<string, Room>,
  io: Server
): void {
  removeSocketFromRooms(socketId, rooms, io, true);
}

export function getSessionInfo(
  socketId: string,
  rooms: Map<string, Room>
): SessionInfo | null {
  for (const room of rooms.values()) {
    if (room.p1Id === socketId) {
      return {
        roomId: room.roomId,
        peerId: room.p2Id,
        type: 'p1',
      };
    }

    if (room.p2Id === socketId) {
      return {
        roomId: room.roomId,
        peerId: room.p1Id,
        type: 'p2',
      };
    }
  }

  return null;
}

function removeSocketFromRooms(
  socketId: string,
  rooms: Map<string, Room>,
  io: Server,
  notifyPeer: boolean
): void {
  for (const [roomId, room] of rooms.entries()) {
    if (room.p1Id !== socketId && room.p2Id !== socketId) {
      continue;
    }

    const peerId = room.p1Id === socketId ? room.p2Id : room.p1Id;
    const participantIds = [room.p1Id, room.p2Id].filter((id): id is string => Boolean(id));

    rooms.delete(roomId);

    participantIds.forEach((participantId) => {
      io.sockets.sockets.get(participantId)?.leave(roomId);
    });

    if (notifyPeer && peerId) {
      io.to(peerId).emit('partner-left');
    }

    return;
  }
}

function findWaitingRoom(
  rooms: Map<string, Room>,
  socketId: string
): { roomId: string; room: Room } | null {
  for (const [roomId, room] of rooms.entries()) {
    if (room.p1Id !== socketId && room.p2Id === null) {
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
