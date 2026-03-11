import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import { handleStart, handleDisconnect, getType, removeSocketFromRooms } from './lib';
import { MatchPayload, Room } from './types';

const DEFAULT_ORIGINS = [
  'https://randomconnect.netlify.app',
  'https://randomconnect.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

function getAllowedOrigins(): string[] {
  const configured = process.env.FRONTEND_ORIGIN
    ?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  return configured && configured.length > 0 ? configured : DEFAULT_ORIGINS;
}

const allowedOrigins = getAllowedOrigins();

const app = express();
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));

const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => console.log(`Server is up, ${PORT}`));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

let onlineUsers = 0;
const rooms: Map<string, Room> = new Map();

io.on('connection', (socket) => {
  onlineUsers++;
  io.emit('online', onlineUsers);

  socket.on('start', (cb: (payload: MatchPayload | { type: 'p1' | 'p2' }) => void) => {
    console.log(`Socket ${socket.id} requested matchmaking`);
    handleStart(rooms, socket, cb, io);
  });

  socket.on('disconnect', () => {
    onlineUsers = Math.max(onlineUsers - 1, 0);
    io.emit('online', onlineUsers);
    handleDisconnect(socket.id, rooms, io);
  });

  socket.on('ice:send', ({ candidate, to, roomId }: { candidate: RTCIceCandidateInit; to?: string; roomId?: string }) => {
    const typeInfo = getType(socket.id, rooms);
    if (!typeInfo) return;

    const targetId = typeInfo.type === 'p1' ? typeInfo.p2id : typeInfo.p1id;
    if (typeInfo.roomId !== roomId) return;
    if (targetId && (!to || to === targetId)) {
      io.to(targetId).emit('ice:reply', { candidate, from: socket.id });
    }
  });

  socket.on('sdp:send', ({ sdp, to, roomId }: { sdp: RTCSessionDescriptionInit; to?: string; roomId?: string }) => {
    const typeInfo = getType(socket.id, rooms);
    if (!typeInfo) return;

    const targetId = typeInfo.type === 'p1' ? typeInfo.p2id : typeInfo.p1id;
    if (typeInfo.roomId !== roomId) return;
    if (targetId && (!to || to === targetId)) {
      io.to(targetId).emit('sdp:reply', { sdp, from: socket.id });
    }
  });

  socket.on('send-message', ({ message, roomId }: { message: string; roomId: string }) => {
    const typeInfo = getType(socket.id, rooms);
    if (!typeInfo) return;
    if (typeInfo.roomId !== roomId) return;

    socket.to(typeInfo.roomId).emit('get-message', message);
  });

  socket.on('skip', ({ roomId }: { roomId?: string } = {}) => {
    console.log(`Socket ${socket.id} skipped current room`);
    const typeInfo = getType(socket.id, rooms);
    if (!typeInfo) return;
    if (roomId && typeInfo.roomId !== roomId) return;
    removeSocketFromRooms(socket.id, rooms, io, 'skipped');
  });
});
