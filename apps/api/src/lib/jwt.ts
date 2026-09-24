import jwt from 'jsonwebtoken';
import { ErrorCodes } from '@society-erp/shared';
import { env } from '../config/env';
import { Errors } from './errors';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  soc: string | null;
  plt: boolean;
  email: string;
  name: string;
  type: 'access';
}

export interface SocketTokenPayload {
  sub: string;
  sid: string;
  soc: string | null;
  plt: boolean;
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    issuer: env.JWT_ISSUER,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: env.JWT_ISSUER }) as AccessTokenPayload;
    if (decoded.type !== 'access') throw Errors.unauthenticated('Invalid token', ErrorCodes.TOKEN_INVALID);
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw Errors.unauthenticated('Session expired', ErrorCodes.TOKEN_EXPIRED);
    if (err instanceof jwt.JsonWebTokenError) throw Errors.unauthenticated('Invalid token', ErrorCodes.TOKEN_INVALID);
    throw err;
  }
}

/** Refresh tokens are opaque random strings persisted (hashed) in the Session collection. */
export const REFRESH_TTL_MS = env.JWT_REFRESH_TTL_SECONDS * 1000;
export const ACCESS_TTL_SECONDS = env.JWT_ACCESS_TTL_SECONDS;
