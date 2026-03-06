import { BaseProvider, SearchOptions } from './base.provider';
import { TrackMeta, SearchResult } from '../../types';
import { redis } from '../redis.client';
import { logger } from '../../utils/logger';

const SC_BASE = 'https://api-v2.soundcloud.com';
const CLIENT_ID = () => process.env.SOUNDCLOUD_CLIENT_ID ?? '';

interface ScTrack {
  id: number;
  title: string;
  user: { username: string; full_name?: string };
  artwork_url?: string;
  full_duration?: number;
  duration?: number;
  genre?: string;
  release_year?: number;
  streamable: boolean;
  policy?: string;
}

export class SoundCloudProvider extends BaseProvider {
  readonly name = 'soundcloud';

  async search(opts: SearchOptions): Promise<SearchResult> {
    const { query, page = 1, limit = 20 } = opts;

    if (!CLIENT_ID()) {
      return { tracks: [], albums: [], total: 0, page, limit };
    }

    const cacheKey = `sc:search:${Buffer.from(query).toString('base64')}:${page}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SearchResult;

    try {
      const offset = (page - 1) * limit;
      const url =
        `${SC_BASE}/search/tracks?q=${encodeURIComponent(query)}` +
        `&client_id=${CLIENT_ID()}&limit=${limit}&offset=${offset}`;

      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`SoundCloud search failed: ${res.status}`);

      const data = (await res.json()) as { collection: ScTrack[]; total_results?: number };
      const streamable = data.collection.filter(
        (t) => t.streamable && t.policy !== 'BLOCK' && t.policy !== 'SNIP',
      );

      const tracks = streamable.map((t) => this.trackToMeta(t));
      const result: SearchResult = { tracks, albums: [], total: data.total_results ?? tracks.length, page, limit };

      await redis.setex(cacheKey, 3600, JSON.stringify(result));
      return result;
    } catch (err) {
      logger.error('SoundCloud search failed', { err });
      return { tracks: [], albums: [], total: 0, page, limit };
    }
  }

  async getTrackMeta(providerId: string): Promise<TrackMeta> {
    const cacheKey = `sc:meta:${providerId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as TrackMeta;

    if (!CLIENT_ID()) throw new Error('SOUNDCLOUD_CLIENT_ID not set');

    const res = await fetch(`${SC_BASE}/tracks/${providerId}?client_id=${CLIENT_ID()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) throw new Error(`SoundCloud track meta failed: ${res.status}`);

    const track = (await res.json()) as ScTrack;
    const meta = this.trackToMeta(track);
    await redis.setex(cacheKey, 86400, JSON.stringify(meta));
    return meta;
  }

  async getStreamUrl(providerId: string): Promise<string> {
    const cacheKey = `sc:stream:${providerId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    if (!CLIENT_ID()) throw new Error('SOUNDCLOUD_CLIENT_ID not set');

    const res = await fetch(`${SC_BASE}/tracks/${providerId}/streams?client_id=${CLIENT_ID()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) throw new Error(`SoundCloud streams failed: ${res.status}`);

    const data = (await res.json()) as Record<string, string>;
    const url = data['progressive'] ?? data['http_mp3_128_url'] ?? data['preview_mp3_128_url'];
    if (!url) throw new Error(`No stream URL for SoundCloud:${providerId}`);

    await redis.setex(cacheKey, 50 * 60, url);
    return url;
  }

  private trackToMeta(t: ScTrack): TrackMeta {
    const artwork = t.artwork_url?.replace('-large', '-t500x500');
    const artist = (t.user.full_name && t.user.full_name.trim()) ? t.user.full_name : t.user.username;
    const duration = Math.floor((t.full_duration ?? t.duration ?? 0) / 1000);

    return {
      id: `soundcloud:${t.id}`,
      provider: 'soundcloud' as const,
      providerId: String(t.id),
      title: t.title,
      artist,
      duration,
      artworkUrl: artwork,
      year: t.release_year,
      genre: t.genre,
      score: 0.72,
    };
  }
}
