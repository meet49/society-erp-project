import type { RequestHandler } from 'express';
import { ErrorCodes } from '@society-erp/shared';
import { verifyAccessToken } from '../lib/jwt';
import { Errors } from '../lib/errors';
import { accessCache } from '../lib/cache';
import { Session } from '../models/session.model';
import { User } from '../models/user.model';

interface SessionState {
  valid: boolean;
  userStatus: string;
}

async function loadSessionState(sessionId: string, userId: string): Promise<SessionState> {
  return accessCache.getOrSet(`access:session:${sessionId}`, async () => {
    const [session, user] = await Promise.all([
      Session.findOne({ familyId: sessionId, revokedAt: null }).select('_id').lean(),
      User.findById(userId).select('status').lean(),
    ]);
    return { valid: Boolean(session), userStatus: user?.status ?? 'INACTIVE' };
  }, 20_000);
}

function extractToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/** Verifies the bearer access token and checks the session family is still valid. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractToken(req.headers.authorization);
    if (!token) throw Errors.unauthenticated();
    const payload = verifyAccessToken(token);
    const state = await loadSessionState(payload.sid, payload.sub);
    if (!state.valid) throw Errors.unauthenticated('Session has been revoked', ErrorCodes.SESSION_REVOKED);
    if (state.userStatus !== 'ACTIVE') throw Errors.unauthenticated('Account is not active', ErrorCodes.ACCOUNT_INACTIVE);
    req.auth = { userId: payload.sub, sessionId: payload.sid, societyId: payload.soc, isPlatform: payload.plt, email: payload.email, name: payload.name };
    next();
  } catch (err) {
    next(err);
  }
};

/** Attaches req.auth when a valid token is present, otherwise continues anonymously. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const token = extractToken(req.headers.authorization);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const state = await loadSessionState(payload.sid, payload.sub);
    if (state.valid && state.userStatus === 'ACTIVE') {
      req.auth = { userId: payload.sub, sessionId: payload.sid, societyId: payload.soc, isPlatform: payload.plt, email: payload.email, name: payload.name };
    }
  } catch {
    /* anonymous */
  }
  next();
};
