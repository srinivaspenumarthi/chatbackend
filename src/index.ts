import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import { handleStart, handleDisconnect, getType } from './lib';
import { Room, GetTypesResult } from './types';

// --- Create app
const app = express();

// --- Proper CORS setup for Express
app.use(cors({
  origin: 'https://chatfrontend-2zcp.vercel.app', // <<< your real deployed frontend URL
  methods: ['GET', 'POST'],
  credentials: true
}));

// --- Start server
const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => console.log(`Server is up, ${PORT}`));

// --- Socket.io server with CORS too
const io = new Server(server, {
  cors: {
    origin: 'https://chatfrontend-2zcp.vercel.app', // <<< same frontend URL
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// --- Variables
let onlineUsers: number = 0;
let rooms: Map<string, Room> = new Map();

// --- Socket.IO event handling
io.on('connection', (socket) => {
  onlineUsers++;
  io.emit('online', onlineUsers);

  // Start matchmaking
  socket.on('start', (cb: (type: 'p1' | 'p2') => void) => {
    handleStart(rooms, socket, cb, io);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    onlineUsers--;
    io.emit('online', onlineUsers);
    handleDisconnect(socket.id, rooms, io);
  });

  // Handle ICE candidates
  socket.on('ice:send', ({ candidate }: { candidate: RTCIceCandidateInit }) => {
    const typeInfo = getType(socket.id, rooms);
    if (typeInfo) {
      const targetId = typeInfo.type === 'p1' ? typeInfo.p2id : typeInfo.p1id;
      if (targetId) {
        io.to(targetId).emit('ice:reply', { candidate, from: socket.id });
      }
    }
  });

  // Handle SDP messages
  socket.on('sdp:send', ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
    const typeInfo = getType(socket.id, rooms);
    if (typeInfo) {
      const targetId = typeInfo.type === 'p1' ? typeInfo.p2id : typeInfo.p1id;
      if (targetId) {
        io.to(targetId).emit('sdp:reply', { sdp, from: socket.id });
      }
    }
  });

  // Handle chat messages
  socket.on('send-message', (message: string, senderType: 'p1' | 'p2', roomId: string) => {
    const label = senderType === 'p1' ? 'You: ' : 'Stranger: ';
    socket.to(roomId).emit('get-message', message, label);
  });
});
