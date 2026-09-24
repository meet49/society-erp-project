import pino from 'pino';
import { env, isProd, isTest } from '../config/env';

/** Keys whose values must never be logged. */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  '*.passwordHash',
  'accessToken',
  'refreshToken',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.keySecret',
  '*.signedUrl',
];

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'society-erp-api' },
  transport: !isProd && !isTest ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } : undefined,
});

export type Logger = typeof logger;
