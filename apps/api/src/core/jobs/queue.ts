import { Queue, Worker, type Job } from 'bullmq';
import { env, isTest } from '../../config/env';
import { logger } from '../../lib/logger';
import { getRedis, redisConfigured } from '../../lib/redis';

export type JobHandler<T = any> = (data: T, meta: { jobId: string; attempt: number; name: string }) => Promise<void>;

export interface AddJobOptions {
  /** stable id → duplicates with the same id are ignored while pending (idempotency) */
  jobId?: string;
  delayMs?: number;
  attempts?: number;
}

export interface RepeatOptions {
  everyMs: number;
  jobId?: string;
}

export interface JobQueue {
  readonly driver: 'bullmq' | 'inprocess';
  register<T>(name: string, handler: JobHandler<T>): void;
  add<T>(name: string, data: T, opts?: AddJobOptions): Promise<void>;
  schedule<T>(name: string, repeat: RepeatOptions, data?: T): Promise<void>;
  start(opts?: { processJobs: boolean }): Promise<void>;
  stop(): Promise<void>;
}

const QUEUE_NAME = 'society-erp';

/** BullMQ implementation for production (Redis backed, durable, retried, horizontally scalable). */
class BullMqQueue implements JobQueue {
  readonly driver = 'bullmq' as const;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private handlers = new Map<string, JobHandler>();

  register<T>(name: string, handler: JobHandler<T>): void {
    this.handlers.set(name, handler as JobHandler);
  }

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(QUEUE_NAME, {
        connection: getRedis()!,
        defaultJobOptions: { removeOnComplete: 500, removeOnFail: 1000, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      });
    }
    return this.queue;
  }

  async add<T>(name: string, data: T, opts: AddJobOptions = {}): Promise<void> {
    await this.getQueue().add(name, data as any, { jobId: opts.jobId, delay: opts.delayMs, attempts: opts.attempts });
  }

  async schedule<T>(name: string, repeat: RepeatOptions, data?: T): Promise<void> {
    await this.getQueue().add(name, (data ?? {}) as any, {
      repeat: { every: repeat.everyMs },
      jobId: repeat.jobId ?? `repeat:${name}`,
    });
  }

  async start(opts = { processJobs: true }): Promise<void> {
    this.getQueue();
    if (!opts.processJobs) return;
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const handler = this.handlers.get(job.name);
        if (!handler) {
          logger.warn({ job: job.name }, 'No handler registered for job');
          return;
        }
        await handler(job.data, { jobId: String(job.id), attempt: job.attemptsMade + 1, name: job.name });
      },
      { connection: getRedis()!, concurrency: 5 },
    );
    this.worker.on('failed', (job, err) => logger.error({ err, job: job?.name, id: job?.id }, 'Job failed'));
    logger.info('BullMQ worker started');
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

interface PendingJob {
  name: string;
  data: unknown;
  jobId?: string;
  timer: NodeJS.Timeout;
}

/**
 * In-process implementation used when REDIS_URL is not configured (local development / tests).
 * Jobs run in the API process, retried up to `attempts` times, without persistence.
 */
class InProcessQueue implements JobQueue {
  readonly driver = 'inprocess' as const;
  private handlers = new Map<string, JobHandler>();
  private pending = new Map<string, PendingJob>();
  private intervals: NodeJS.Timeout[] = [];
  private processJobs = true;
  private counter = 0;

  register<T>(name: string, handler: JobHandler<T>): void {
    this.handlers.set(name, handler as JobHandler);
  }

  async add<T>(name: string, data: T, opts: AddJobOptions = {}): Promise<void> {
    if (!this.processJobs) return;
    const id = opts.jobId ?? `${name}:${++this.counter}`;
    if (opts.jobId && this.pending.has(opts.jobId)) return; // idempotent while pending
    const timer = setTimeout(() => {
      this.pending.delete(id);
      void this.run(name, data, id, opts.attempts ?? 3);
    }, opts.delayMs ?? 0);
    if (typeof timer.unref === 'function') timer.unref();
    this.pending.set(id, { name, data, jobId: id, timer });
  }

  async schedule<T>(name: string, repeat: RepeatOptions, data?: T): Promise<void> {
    if (!this.processJobs || isTest) return;
    const interval = setInterval(() => void this.run(name, data ?? {}, `${name}:repeat`, 1), repeat.everyMs);
    if (typeof interval.unref === 'function') interval.unref();
    this.intervals.push(interval);
  }

  private async run(name: string, data: unknown, jobId: string, attempts: number, attempt = 1): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) {
      logger.warn({ job: name }, 'No handler registered for job');
      return;
    }
    try {
      await handler(data, { jobId, attempt, name });
    } catch (err) {
      logger.error({ err, job: name, attempt }, 'Job failed');
      if (attempt < attempts) {
        const t = setTimeout(() => void this.run(name, data, jobId, attempts, attempt + 1), 2000 * attempt);
        if (typeof t.unref === 'function') t.unref();
      }
    }
  }

  async start(opts = { processJobs: true }): Promise<void> {
    this.processJobs = opts.processJobs;
    if (!isTest) logger.warn('REDIS_URL not set - using in-process job queue (not for production)');
  }

  async stop(): Promise<void> {
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
    this.intervals.forEach(clearInterval);
    this.intervals = [];
  }
}

export const jobQueue: JobQueue = redisConfigured() && env.NODE_ENV !== 'test' ? new BullMqQueue() : new InProcessQueue();
