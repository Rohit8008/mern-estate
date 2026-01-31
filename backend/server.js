import http from 'http';
import { Server } from 'socket.io';

import databaseConnection from './config/database.js';
import { config } from './config/environment.js';
import { createApp } from './app.js';

// In-memory online presence
const onlineUsers = new Set();

export const app = createApp();
export const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  },
});

export async function startServer() {
  await databaseConnection.connect();

  return new Promise((resolve, reject) => {
    server.listen(config.server.port, config.server.host, () => {
      resolve();
    });

    server.on('error', (err) => reject(err));
  });
}

export function setupSocket() {
  io.on('connection', (socket) => {
    const userId = socket.handshake.auth?.userId;
    if (userId) {
      socket.join(`user:${userId}`);
      onlineUsers.add(String(userId));
      io.emit('presence:update', { userId: String(userId), online: true });
      try {
        socket.emit('presence:bulk', Array.from(onlineUsers));
      } catch (_) {}
    }

    socket.on('typing', (payload) => {
      const { to } = payload || {};
      if (to) io.to(`user:${to}`).emit('typing', { from: userId });
    });

    socket.on('stop_typing', (payload) => {
      const { to } = payload || {};
      if (to) io.to(`user:${to}`).emit('stop_typing', { from: userId });
    });

    socket.on('disconnect', () => {
      if (userId) {
        onlineUsers.delete(String(userId));
        io.emit('presence:update', { userId: String(userId), online: false });
      }
    });
  });
}

export async function stopServer() {
  try {
    await databaseConnection.disconnect();
  } catch (_) {}

  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
