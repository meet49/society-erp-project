import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger';
import { isTest } from '../config/env';

/** Assigns a request id (honouring an incoming X-Request-Id) and a child logger; logs the outcome. */
export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  req.log = logger.child({ requestId: id });
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (isTest) return;
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    req.log[level](
      {
        method: req.method,
        route: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.originalUrl.split('?')[0],
        status: res.statusCode,
        duration: Math.round(durationMs * 100) / 100,
        errorCode: res.locals.errorCode,
        userId: req.auth?.userId,
        societyId: req.auth?.societyId,
      },
      'request completed',
    );
  });
  next();
};
