import { logger } from '../../lib/logger';

export interface DomainEvent<T = any> {
  name: string;
  payload: T;
  societyId?: string | null;
  actorId?: string | null;
  at: Date;
}

type Handler<T = any> = (event: DomainEvent<T>) => Promise<void> | void;

/**
 * Lightweight domain event bus. Business services emit events (complaint.created, payment.received...)
 * and infrastructure (notifications, realtime, audit, analytics) subscribes without coupling.
 */
class DomainEventBus {
  private handlers = new Map<string, Handler[]>();

  on<T = any>(name: string, handler: Handler<T>): () => void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler);
    this.handlers.set(name, list);
    return () => this.off(name, handler);
  }

  off(name: string, handler: Handler): void {
    const list = this.handlers.get(name) ?? [];
    this.handlers.set(
      name,
      list.filter((h) => h !== handler),
    );
  }

  /** Emit asynchronously; handler failures are isolated and logged. */
  emit<T = any>(name: string, payload: T, ctx: { societyId?: string | null; actorId?: string | null } = {}): void {
    const event: DomainEvent<T> = { name, payload, societyId: ctx.societyId ?? null, actorId: ctx.actorId ?? null, at: new Date() };
    const list = [...(this.handlers.get(name) ?? []), ...(this.handlers.get('*') ?? [])];
    for (const handler of list) {
      Promise.resolve()
        .then(() => handler(event))
        .catch((err) => logger.error({ err, event: name }, 'Domain event handler failed'));
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const domainEvents = new DomainEventBus();
