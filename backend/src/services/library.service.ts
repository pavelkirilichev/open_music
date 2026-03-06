import { prisma } from '../prisma/client';
import { upsertTrack, getTrackMeta } from './search.service';
import { AppError } from '../utils/errors';

export async function getLikedTracks(userId: string, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.libraryTrack.findMany({
      where: { userId },
      include: { track: true },
      orderBy: { likedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.libraryTrack.count({ where: { userId } }),
  ]);
  return { tracks: items.map((i) => i.track), total, page, limit };
}

export async function likeTrack(userId: string, provider: string, providerId: string) {
  const meta = await getTrackMeta(provider, providerId);
  const trackId = await upsertTrack(meta);
  try {
    await prisma.libraryTrack.create({ data: { userId, trackId } });
  } catch { /* Already liked */ }
  return { success: true };
}

export async function unlikeTrack(userId: string, provider: string, providerId: string) {
  const track = await prisma.track.findUnique({
    where: { provider_providerId: { provider, providerId } },
    select: { id: true },
  });
  if (!track) return { success: true };
  await prisma.libraryTrack.deleteMany({ where: { userId, trackId: track.id } });
  return { success: true };
}

export async function isTrackLiked(userId: string, provider: string, providerId: string) {
  const track = await prisma.track.findUnique({
    where: { provider_providerId: { provider, providerId } },
    select: { id: true },
  });
  if (!track) return false;
  const liked = await prisma.libraryTrack.findUnique({
    where: { userId_trackId: { userId, trackId: track.id } },
  });
  return !!liked;
}

export async function getLibraryAlbums(userId: string) {
  const rows = await prisma.libraryAlbum.findMany({
    where: { userId },
    orderBy: { addedAt: 'desc' },
  });
  return rows.map((r) => ({ ...r, albumRef: JSON.parse(r.albumRefJson) }));
}

export async function addAlbum(userId: string, albumRef: Record<string, unknown>) {
  return prisma.libraryAlbum.create({
    data: { userId, albumRefJson: JSON.stringify(albumRef) },
  });
}

export async function removeAlbum(userId: string, albumId: string) {
  const album = await prisma.libraryAlbum.findFirst({ where: { id: albumId, userId } });
  if (!album) throw new AppError(404, 'Album not in library', 'NOT_FOUND');
  await prisma.libraryAlbum.delete({ where: { id: albumId } });
  return { success: true };
}

export async function getHistory(userId: string, limit = 50) {
  const history = await prisma.listenHistory.findMany({
    where: { userId },
    include: { track: true },
    orderBy: { listenedAt: 'desc' },
    take: limit,
    distinct: ['trackId'],
  });
  return history.map((h) => ({ ...h.track, listenedAt: h.listenedAt }));
}

export async function addToHistory(
  userId: string,
  provider: string,
  providerId: string,
  durationMs?: number,
) {
  const track = await prisma.track.findUnique({
    where: { provider_providerId: { provider, providerId } },
    select: { id: true },
  });
  if (!track) return;
  await prisma.listenHistory.create({ data: { userId, trackId: track.id, durationMs } });
}

// ─── Artist likes ──────────────────────────────────────────────────────────────

export async function getLibraryArtists(userId: string) {
  const rows = await prisma.libraryArtist.findMany({
    where: { userId },
    orderBy: { addedAt: 'desc' },
  });
  return rows.map((r) => ({ ...r, artistRef: JSON.parse(r.artistJson) }));
}

export async function addArtist(userId: string, artistRef: Record<string, unknown>) {
  return prisma.libraryArtist.create({
    data: { userId, artistJson: JSON.stringify(artistRef) },
  });
}

export async function removeArtist(userId: string, artistId: string) {
  const artist = await prisma.libraryArtist.findFirst({ where: { id: artistId, userId } });
  if (!artist) throw new AppError(404, 'Artist not in library', 'NOT_FOUND');
  await prisma.libraryArtist.delete({ where: { id: artistId } });
  return { success: true };
}

export async function getLikedBatch(
  userId: string,
  items: Array<{ provider: string; providerId: string }>,
): Promise<string[]> {
  // Find all matching tracks in DB
  const tracks = await prisma.track.findMany({
    where: {
      OR: items.map((i) => ({ provider: i.provider, providerId: i.providerId })),
    },
    select: { id: true, provider: true, providerId: true },
  });

  if (tracks.length === 0) return [];

  // Check which ones are liked
  const liked = await prisma.libraryTrack.findMany({
    where: {
      userId,
      trackId: { in: tracks.map((t) => t.id) },
    },
    select: { trackId: true },
  });

  const likedIds = new Set(liked.map((l) => l.trackId));
  return tracks
    .filter((t) => likedIds.has(t.id))
    .map((t) => `${t.provider}:${t.providerId}`);
}
