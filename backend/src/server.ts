import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { logger } from './utils/logger';
import { prisma } from './prisma/client';
import { initRedis, redis, redisAvailable } from './services/redis.client';

const PORT = Number(process.env.PORT) || 3001;

async function main() {
  await prisma.$connect();
  logger.info('SQLite database connected');

  await initRedis();

  if (redisAvailable) {
    try {
      const { startWorkers } = await import('./jobs/queue');
      await startWorkers();
      logger.info('BullMQ workers started (audio caching enabled)');
    } catch (err) {
      logger.warn('BullMQ failed to start', { err });
    }
  } else {
    logger.warn('BullMQ skipped (Redis unavailable) — audio caching disabled');
  }

  const app = createApp();
  const server = http.createServer(app);

  server.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`API docs: http://localhost:${PORT}/api/docs`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      await redis.quit();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { err });
  process.exit(1);
});
