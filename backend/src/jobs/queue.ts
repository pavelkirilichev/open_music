/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from '../utils/logger';

export interface CacheAudioJobData {
  cacheId: string;
  provider: string;
  providerId: string;
  storageKey: string;
}

// Lazy queue — only created when Redis is available
let _queue: any = null;

async function getQueue(): Promise<any> {
  if (_queue) return _queue;
  const { Queue } = await import('bullmq');
  const { redis } = await import('../services/redis.client');
  _queue = new Queue('cache-audio', {
    connection: redis as any,
    defaultJobOptions: { removeOnComplete: 100, removeOnFail: 200 },
  });
  return _queue;
}

/** Добавить задачу в очередь (no-op если BullMQ/Redis недоступен) */
export const cacheAudioQueue = {
  add: async (name: string, data: CacheAudioJobData, opts?: any) => {
    try {
      const q = await getQueue();
      return await q.add(name, data, opts);
    } catch (err) {
      logger.warn('BullMQ unavailable — cache job skipped', { err });
    }
  },
};

export async function startWorkers() {
  const { Worker } = await import('bullmq');
  const { redis } = await import('../services/redis.client');
  const { processCacheAudioJob } = await import('./cacheAudio.job');

  const worker = new Worker(
    'cache-audio',
    async (job: any) => {
      logger.info('Processing cache job', { id: job.id });
      await processCacheAudioJob(job.data as CacheAudioJobData);
    },
    { connection: redis as any, concurrency: 2 },
  );

  worker.on('completed', (job: any) => logger.info('Job done', { id: job.id }));
  worker.on('failed', (job: any, err: any) => logger.error('Job failed', { id: job?.id, err }));
  return worker;
}
