import { EventEmitter } from 'node:events';

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Small in-process TTL cache with namespaced invalidation.
 * Cross-instance invalidation is propagated through the InvalidationBus (Redis pub/sub when configured).
 */
export class TtlCache {
  private store = new Map<string, Entry<unknown>>();

  constructor(private readonly defaultTtlMs: number) {}

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs = this.defaultTtlMs): T {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  async getOrSet<T>(key: string, loader: () => Promise<T>, ttlMs = this.defaultTtlMs): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await loader();
    return this.set(key, value, ttlMs);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deletePrefix(prefix: string): void {
    for (const key of this.store.keys()) if (key.startsWith(prefix)) this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/** Publishes/receives invalidation messages so every API instance drops stale access caches. */
class InvalidationBus extends EventEmitter {
  private publisher: ((channel: string, message: string) => Promise<unknown>) | null = null;

  attachPublisher(fn: (channel: string, message: string) => Promise<unknown>): void {
    this.publisher = fn;
  }

  /** Emit locally and broadcast to other instances. */
  async invalidate(topic: string, key = '*'): Promise<void> {
    this.emit('invalidate', topic, key);
    if (this.publisher) {
      try {
        await this.publisher('society-erp:invalidate', JSON.stringify({ topic, key }));
      } catch {
        /* best effort */
      }
    }
  }

  /** Called when a message arrives from another instance. */
  receive(raw: string): void {
    try {
      const { topic, key } = JSON.parse(raw) as { topic: string; key: string };
      this.emit('invalidate', topic, key);
    } catch {
      /* ignore malformed */
    }
  }
}

export const invalidationBus = new InvalidationBus();
invalidationBus.setMaxListeners(50);

export const accessCache = new TtlCache(30_000);
export const configCache = new TtlCache(60_000);

invalidationBus.on('invalidate', (topic: string, key: string) => {
  if (topic === 'all') {
    accessCache.clear();
    configCache.clear();
    return;
  }
  const cache = topic.startsWith('config') ? configCache : accessCache;
  if (key === '*') {
    cache.delete(topic);
    cache.deletePrefix(`${topic}:`);
  } else if (key.endsWith('*')) cache.deletePrefix(`${topic}:${key.slice(0, -1)}`);
  else {
    cache.delete(`${topic}:${key}`);
    cache.deletePrefix(`${topic}:${key}:`);
  }
});
