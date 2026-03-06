import { searchAll, getProvider } from './providers/registry';
import { prisma } from '../prisma/client';
import { TrackMeta } from '../types';

export type SearchType = 'track' | 'album' | 'artist';

export async function search(opts: {
  query: string;
  provider?: string;
  type?: SearchType;
  page?: number;
  limit?: number;
}) {
  return searchAll(opts);
}

/**
 * Upsert track metadata into DB so we can reference it from library/playlists.
 * Returns the internal DB id.
 */
export async function upsertTrack(meta: TrackMeta): Promise<string> {
  const track = await prisma.track.upsert({
    where: { provider_providerId: { provider: meta.provider, providerId: meta.providerId } },
    create: {
      provider: meta.provider,
      providerId: meta.providerId,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      duration: meta.duration,
      artworkUrl: meta.artworkUrl,
      year: meta.year,
      genre: meta.genre,
    },
    update: {
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      duration: meta.duration,
      artworkUrl: meta.artworkUrl,
    },
    select: { id: true },
  });
  return track.id;
}

export async function getTrackMeta(provider: string, providerId: string): Promise<TrackMeta> {
  return getProvider(provider).getTrackMeta(providerId);
}
