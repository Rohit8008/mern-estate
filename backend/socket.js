import { Server } from 'socket.io';

import { config } from './config/environment.js';

export let io;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.cors.origin,
      credentials: config.cors.credentials,
    },
  });

  return io;
}
