import rateLimit, { type Options } from 'express-rate-limit';
import { env, isTest } from '../config/env';
import { Errors } from '../lib/errors';

const handler: Options['handler'] = (_req, _res, next) => next(Errors.rateLimited());

/** General API limiter (per IP). */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: isTest ? 100_000 : env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

/** Strict limiter for credential endpoints (brute-force protection, complements account lockout). */
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: isTest ? 100_000 : env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler,
});

/** Public form limiter (leads, support, signup). */
export const publicFormRateLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: isTest ? 100_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

/** Webhook limiter (per IP) — generous, providers retry aggressively. */
export const webhookRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 100_000 : 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});
