import { api } from '../api/client';
import { Track } from '../types';
import { useQueueStore } from '../store/queue.store';

interface FindTrackResult {
  provider: string;
  providerId: string;
  artworkUrl?: string;
}

/**
 * If track.provider === 'musicbrainz', calls the find-track API to get a YouTube match.
 * Updates the queue entry in place (does NOT call setQueue to avoid resetting shuffle).
 * Returns the resolved track, or null if not found.
 * If track.provider !== 'musicbrainz', returns the track unchanged.
 */
export async function resolveTrackForPlayback(track: Track): Promise<Track | null> {
  if (track.provider !== 'musicbrainz') return track;

  try {
    const result = await api.get<FindTrackResult | null>('/artists/find-track', {
      artist: track.artist,
      title: track.title,
      ...(track.album ? { album: track.album } : {}),
      ...(track.duration ? { duration: track.duration } : {}),
    } as Record<string, unknown>);

    if (!result?.providerId) return null;

    const resolved: Track = {
      ...track,
      provider: result.provider as Track['provider'],
      providerId: result.providerId,
      mbid: track.providerId, // preserve original MB recording ID
      // Keep existing artworkUrl (CAA) — don't use YouTube thumbnail for artwork
    };

    // Update the queue entry in-place without resetting currentIndex or shuffledIndices
    const state = useQueueStore.getState();
    const idx = state.queue.findIndex(
      (t) => t.provider === 'musicbrainz' && t.providerId === track.providerId,
    );
    if (idx >= 0) {
      const updatedQueue = [...state.queue];
      updatedQueue[idx] = resolved;
      useQueueStore.setState({ queue: updatedQueue, currentIndex: idx });
    }

    return resolved;
  } catch {
    return null;
  }
}
