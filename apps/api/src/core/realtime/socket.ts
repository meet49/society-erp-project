import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { corsOrigins } from '../../config/env';
import { verifyAccessToken } from '../../lib/jwt';
import { logger } from '../../lib/logger';
import { accessControlService } from '../access-control/access-control.service';

let io: Server | null = null;

/** Rooms are decided by the server from the authenticated token; clients can never join arbitrary rooms. */
async function joinRooms(socket: Socket): Promise<void> {
  const auth = socket.data.auth as { userId: string; societyId: string | null; isPlatform: boolean };
  await socket.join(`user:${auth.userId}`);
  if (auth.isPlatform) {
    const platform = await accessControlService.resolvePlatformContext(auth.userId);
    if (platform) await socket.join('platform');
  }
  if (auth.societyId) {
    const tenant = await accessControlService.resolveTenantContext(auth.userId, auth.societyId);
    if (tenant) {
      await socket.join(`society:${auth.societyId}`);
      for (const roleKey of tenant.roleKeys) await socket.join(`society:${auth.societyId}:role:${roleKey}`);
      if (tenant.permissions.has('visitors:checkin') || tenant.permissions.has('visitors:checkout')) await socket.join(`society:${auth.societyId}:gate`);
      for (const unitId of tenant.unitIds) await socket.join(`society:${auth.societyId}:unit:${unitId}`);
    }
  }
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    path: '/socket.io',
    serveClient: false,
  });

  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string | undefined) ?? (socket.handshake.headers.authorization?.split(' ')[1] ?? '');
      if (!token) return next(new Error('UNAUTHENTICATED'));
      const payload = verifyAccessToken(token);
      socket.data.auth = { userId: payload.sub, societyId: payload.soc, isPlatform: payload.plt, sessionId: payload.sid };
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    joinRooms(socket)
      .then(() => socket.emit('ready', { rooms: [...socket.rooms].filter((r) => r !== socket.id) }))
      .catch((err) => {
        logger.error({ err }, 'socket room assignment failed');
        socket.disconnect(true);
      });
    // the only client → server message: a ping to keep presence; everything else is server-pushed
    socket.on('presence:ping', () => socket.emit('presence:pong', { at: Date.now() }));
  });

  return io;
}

export function getIo(): Server | null {
  return io;
}

export const realtime = {
  toSociety(societyId: string, event: string, payload: unknown): void {
    io?.to(`society:${societyId}`).emit(event, payload);
  },
  toUser(userId: string, event: string, payload: unknown): void {
    io?.to(`user:${userId}`).emit(event, payload);
  },
  toUsers(userIds: string[], event: string, payload: unknown): void {
    if (!io || !userIds.length) return;
    io.to(userIds.map((u) => `user:${u}`)).emit(event, payload);
  },
  toRole(societyId: string, roleKey: string, event: string, payload: unknown): void {
    io?.to(`society:${societyId}:role:${roleKey}`).emit(event, payload);
  },
  toGate(societyId: string, event: string, payload: unknown): void {
    io?.to(`society:${societyId}:gate`).emit(event, payload);
  },
  toUnit(societyId: string, unitId: string, event: string, payload: unknown): void {
    io?.to(`society:${societyId}:unit:${unitId}`).emit(event, payload);
  },
  toPlatform(event: string, payload: unknown): void {
    io?.to('platform').emit(event, payload);
  },
};
