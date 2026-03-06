import { prisma } from '../prisma/client';
import { cacheAudioQueue } from '../jobs/queue';
import { upsertTrack, getTrackMeta } from './search.service';

export async function requestCache(
  provider: string,
  providerId: string,
  userId: string,
) {
  const meta = await getTrackMeta(provider, providerId);
  const trackId = await upsertTrack(meta);

  // Check if already cached or processing
  const existing = await prisma.cachedAudio.findFirst({
    where: {
      trackId,
      OR: [{ userId: null }, { userId }],
      status: { in: ['ready', 'processing', 'pending'] },
    },
  });

  if (existing?.status === 'ready') {
    return { status: 'ready', cacheId: existing.id };
  }
  if (existing?.status === 'processing' || existing?.status === 'pending') {
    return { status: existing.status, cacheId: existing.id };
  }

  const ttl = Number(process.env.CACHE_AUDIO_TTL) || 7 * 24 * 3600;
  const storageKey = `audio/${provider}/${providerId}.%(ext)s`;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const cache = await prisma.cachedAudio.create({
    data: { trackId, userId, storageKey, expiresAt, status: 'pending' },
  });

  // Enqueue BullMQ job
  await cacheAudioQueue.add(
    'cache-audio',
    { cacheId: cache.id, provider, providerId, storageKey },
    { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } },
  );

  return { status: 'pending', cacheId: cache.id };
}

export async function getCacheStatus(provider: string, providerId: string, userId: string) {
  const track = await prisma.track.findUnique({
    where: { provider_providerId: { provider, providerId } },
    select: { id: true },
  });

  if (!track) return { status: 'not_cached' as const };

  const cache = await prisma.cachedAudio.findFirst({
    where: {
      trackId: track.id,
      OR: [{ userId: null }, { userId }],
    },
    orderBy: { createdAt: 'desc' },
    select: { status: true, errorMsg: true, expiresAt: true },
  });

  return cache ?? { status: 'not_cached' as const };
}
