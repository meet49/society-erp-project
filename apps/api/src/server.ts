import http from 'node:http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/mongo';
import { initRedisInvalidation, closeRedis, redisConfigured } from './lib/redis';
import { createApp } from './app';
import { initSocket } from './core/realtime/socket';
import { startJobs, stopJobs } from './core/jobs/scheduler';
import { ensureBootstrapData } from './seed/bootstrap';
import './core/notifications/subscribers';

async function main(): Promise<void> {
  await connectDatabase();
  await ensureBootstrapData();
  if (redisConfigured()) await initRedisInvalidation();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  // With BullMQ the dedicated worker process handles jobs; without Redis the API process runs them in-process.
  await startJobs({ processJobs: !redisConfigured(), schedule: true });

  server.listen(env.PORT, env.HOST, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Society ERP API listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close();
    await stopJobs();
    await closeRedis();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start API');
  process.exit(1);
});
