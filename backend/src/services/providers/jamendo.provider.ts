import { BaseProvider, SearchOptions } from './base.provider';
import { TrackMeta, AlbumMeta, SearchResult } from '../../types';
import { redis } from '../redis.client';
import { logger } from '../../utils/logger';

const JAMENDO_BASE = 'https://api.jamendo.com/v3.0';
const CLIENT_ID = () => process.env.JAMENDO_CLIENT_ID ?? '';

interface JamendoTrack {
  id: string;
  name: string;
  artist_name: string;
  album_name?: string;
  album_id?: string;
  duration?: number;
  image?: string;
  audio: string; // direct MP3 stream URL
  releasedate?: string;
  genre?: string;
  license_ccurl?: string;
}

interface JamendoAlbum {
  id: string;
  name: string;
  artist_name: string;
  image?: string;
  releasedate?: string;
}

export class JamendoProvider extends BaseProvider {
  readonly name = 'jamendo';

  async search(opts: SearchOptions): Promise<SearchResult> {
    const { query, type = 'track', page = 1, limit = 20 } = opts;
    const cacheKey = `jamendo:search:${Buffer.from(query).toString('base64')}:${type}:${page}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SearchResult;

    if (!CLIENT_ID()) {
      logger.warn('JAMENDO_CLIENT_ID not set — skipping Jamendo');
      return { tracks: [], albums: [], total: 0, page, limit };
    }

    try {
      const offset = (page - 1) * limit;
      const tracks: TrackMeta[] = [];
      const albums: AlbumMeta[] = [];

      if (type === 'track' || type === 'artist') {
        const url =
          `${JAMENDO_BASE}/tracks/?client_id=${CLIENT_ID()}` +
          `&format=json&namesearch=${encodeURIComponent(query)}` +
          `&limit=${limit}&offset=${offset}&include=licenses musicinfo`;

        const res = await fetch(url);
        const data = (await res.json()) as {
          results: JamendoTrack[];
          headers: { resultcount: number };
        };

        tracks.push(...data.results.map((t) => this.trackToMeta(t)));

        const result: SearchResult = {
          tracks,
          albums,
          total: data.headers.resultcount,
          page,
          limit,
        };
        await redis.setex(cacheKey, 3600, JSON.stringify(result));
        return result;
      }

      if (type === 'album') {
        const url =
          `${JAMENDO_BASE}/albums/?client_id=${CLIENT_ID()}` +
          `&format=json&namesearch=${encodeURIComponent(query)}` +
          `&limit=${limit}&offset=${offset}`;

        const res = await fetch(url);
        const data = (await res.json()) as {
          results: JamendoAlbum[];
          headers: { resultcount: number };
        };

        albums.push(...data.results.map((a) => this.albumToMeta(a)));

        const result: SearchResult = {
          tracks,
          albums,
          total: data.headers.resultcount,
          page,
          limit,
        };
        await redis.setex(cacheKey, 3600, JSON.stringify(result));
        return result;
      }

      return { tracks, albums, total: 0, page, limit };
    } catch (err) {
      logger.error('Jamendo search failed', { err });
      return { tracks: [], albums: [], total: 0, page, limit };
    }
  }

  async getTrackMeta(providerId: string): Promise<TrackMeta> {
    const cacheKey = `jamendo:meta:${providerId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as TrackMeta;

    const url =
      `${JAMENDO_BASE}/tracks/?client_id=${CLIENT_ID()}` +
      `&format=json&id=${providerId}`;

    const res = await fetch(url);
    const data = (await res.json()) as { results: JamendoTrack[] };
    if (!data.results[0]) throw new Error(`Track not found: jamendo:${providerId}`);

    const meta = this.trackToMeta(data.results[0]);
    await redis.setex(cacheKey, 86400, JSON.stringify(meta));
    return meta;
  }

  async getStreamUrl(providerId: string): Promise<string> {
    // Jamendo provides direct MP3 URLs — get from metadata
    const meta = await this.getTrackMeta(providerId);
    const cacheKey = `jamendo:stream:${providerId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const url =
      `${JAMENDO_BASE}/tracks/?client_id=${CLIENT_ID()}` +
      `&format=json&id=${providerId}`;

    const res = await fetch(url);
    const data = (await res.json()) as { results: JamendoTrack[] };
    const track = data.results[0];
    if (!track?.audio) throw new Error(`No stream URL for Jamendo:${providerId}`);

    // Jamendo MP3 URLs are permanent
    await redis.setex(cacheKey, 24 * 3600, track.audio);
    void meta;
    return track.audio;
  }

  private trackToMeta(t: JamendoTrack): TrackMeta {
    return {
      id: `jamendo:${t.id}`,
      provider: 'jamendo',
      providerId: t.id,
      title: t.name,
      artist: t.artist_name,
      album: t.album_name,
      duration: t.duration,
      artworkUrl: t.image,
      year: t.releasedate ? new Date(t.releasedate).getFullYear() : undefined,
      genre: t.genre,
      score: 0.75,
    };
  }

  private albumToMeta(a: JamendoAlbum): AlbumMeta {
    return {
      provider: 'jamendo',
      providerId: a.id,
      title: a.name,
      artist: a.artist_name,
      artworkUrl: a.image,
      year: a.releasedate ? new Date(a.releasedate).getFullYear() : undefined,
    };
  }
}
