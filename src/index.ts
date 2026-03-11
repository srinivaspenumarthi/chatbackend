import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import { handleDisconnect, handleSkip, handleStart, getSessionInfo } from './lib';
import { Room } from './types';

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

  socket.on('start', () => {
    console.log(`Socket ${socket.id} requested matchmaking`);
    handleStart(rooms, socket, io);
  });

  socket.on('disconnect', () => {
    onlineUsers = Math.max(onlineUsers - 1, 0);
    io.emit('online', onlineUsers);
    handleDisconnect(socket.id, rooms, io);
  });

  socket.on('ice:send', ({ candidate, to, roomId }: { candidate: RTCIceCandidateInit; to?: string; roomId?: string }) => {
    const session = getSessionInfo(socket.id, rooms);
    if (!session || session.roomId !== roomId) return;

    if (session.peerId && (!to || to === session.peerId)) {
      io.to(session.peerId).emit('ice:reply', { candidate, from: socket.id, roomId });
    }
  });

  socket.on('sdp:send', ({ sdp, to, roomId }: { sdp: RTCSessionDescriptionInit; to?: string; roomId?: string }) => {
    const session = getSessionInfo(socket.id, rooms);
    if (!session || session.roomId !== roomId) return;

    if (session.peerId && (!to || to === session.peerId)) {
      io.to(session.peerId).emit('sdp:reply', { sdp, from: socket.id, roomId });
    }
  });

  socket.on('send-message', ({ message, roomId }: { message: string; roomId: string }) => {
    const session = getSessionInfo(socket.id, rooms);
    if (!session || session.roomId !== roomId) return;

    socket.to(session.roomId).emit('get-message', message);
  });

  socket.on('skip', ({ roomId }: { roomId?: string } = {}) => {
    console.log(`Socket ${socket.id} skipped current room`);
    const session = getSessionInfo(socket.id, rooms);
    if (!session || (roomId && session.roomId !== roomId)) return;
    handleSkip(socket.id, rooms, io);
  });
});
