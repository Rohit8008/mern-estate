import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { runWithTenant } from './tenancy/tenantContext.js';
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

      // The user lookup has to happen before we know the tenant from the
      // database, so it reads the tenant from the signed token instead — the
      // same claim resolveTenant trusts for HTTP.
      if (!payload.tid) {
        return next(new Error('Session predates workspaces. Please sign in again.'));
      }

      const user = await runWithTenant({ tenantId: String(payload.tid) }, () =>
        User.findById(payload.id).select('status').lean()
      );
      if (!user || user.status === 'inactive' || user.status === 'suspended') {
        return next(new Error('Account is disabled'));
      }

      socket.userId = String(payload.id);
      socket.tenantId = String(payload.tid);
      return next();
    } catch {
      return next(new Error('Invalid or expired token'));
    }
  });

  return io;
}


/**
 * Emit to one workspace.
 *
 * `io.emit()` reaches every socket on the deployment. In a shared-database
 * multi-tenant product that is every other agency, so a bare emit is always a
 * bug — the payloads carried import counts and category slugs between
 * customers. Every connection joins `tenant:<id>` at handshake (server.js), so
 * this is the only broadcast a controller should ever need.
 *
 * Greppable on purpose: `io.emit(` should return nothing outside this file.
 */
export function emitToTenant(tenantId, event, payload) {
  if (!io || !tenantId) return;
  try {
    io.to(`tenant:${String(tenantId)}`).emit(event, payload);
  } catch (_) {
    // A broadcast failure must never fail the request that triggered it.
  }
}

/**
 * Send to one person, wherever they are connected.
 *
 * Every connection joins `user:<id>` at handshake (server.js), so this reaches
 * all of that person's open tabs and devices and nobody else's. The room name
 * is derived from the user id alone, but a socket only ever joins its own, and
 * ids are unguessable — so this does not need a tenant prefix to stay private.
 */
export function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  try {
    io.to(`user:${String(userId)}`).emit(event, payload);
  } catch (_) {
    // A push failure must never fail the request that triggered it.
  }
}
