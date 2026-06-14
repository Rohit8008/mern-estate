import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from './models/user.model.js';
import { config } from './config/environment.js';

export let io;

// Parse cookies from the raw Cookie header string without any external dependency.
function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    try {
      out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
    } catch {
      out[key] = pair.slice(idx + 1).trim();
    }
  }
  return out;
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.cors.origin,
      credentials: config.cors.credentials,
    },
  });

  // SEC-001: Verify the access_token JWT from the httpOnly cookie on every
  // Socket.IO connection. Unauthenticated or invalid connections are rejected
  // before any event handlers run.
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers?.cookie);
      const token = cookies.access_token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = jwt.verify(token, config.jwt.secret, {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
      });

      const user = await User.findById(payload.id).select('status').lean();
      if (!user || user.status === 'inactive' || user.status === 'suspended') {
        return next(new Error('Account is disabled'));
      }

      socket.userId = String(payload.id);
      return next();
    } catch {
      return next(new Error('Invalid or expired token'));
    }
  });

  return io;
}
