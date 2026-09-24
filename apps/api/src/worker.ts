import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/mongo';
import { initRedisInvalidation, closeRedis, redisConfigured } from './lib/redis';
import { startJobs, stopJobs } from './core/jobs/scheduler';
import './core/notifications/subscribers';

/** Dedicated BullMQ worker process (production). Requires REDIS_URL. */
async function main(): Promise<void> {
  if (!redisConfigured()) {
    logger.fatal('REDIS_URL is required to run the worker process');
    process.exit(1);
  }
  await connectDatabase();
  await initRedisInvalidation();
  await startJobs({ processJobs: true, schedule: true });
  logger.info('Society ERP worker started');

  const shutdown = async () => {
    await stopJobs();
    await closeRedis();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
