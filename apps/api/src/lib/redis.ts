import IORedis, { type Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';
import { invalidationBus } from './cache';

let client: Redis | null = null;
let subscriber: Redis | null = null;

export function redisConfigured(): boolean {
  return Boolean(env.REDIS_URL);
}

/** Returns a shared Redis connection or null when Redis is not configured. */
export function getRedis(): Redis | null {
  if (!redisConfigured()) return null;
  if (!client) {
    client = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false });
    client.on('error', (err) => logger.error({ err }, 'Redis error'));
    client.on('connect', () => logger.info('Redis connected'));
  }
  return client;
}

/** Wires cross-instance cache invalidation through Redis pub/sub (no-op without Redis). */
export async function initRedisInvalidation(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  subscriber = redis.duplicate();
  await subscriber.subscribe('society-erp:invalidate');
  subscriber.on('message', (_channel, message) => invalidationBus.receive(message));
  invalidationBus.attachPublisher((channel, message) => redis.publish(channel, message));
}

export async function closeRedis(): Promise<void> {
  await subscriber?.quit().catch(() => undefined);
  await client?.quit().catch(() => undefined);
  subscriber = null;
  client = null;
}
