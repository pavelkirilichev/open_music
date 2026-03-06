/**
 * Zaycev.net provider
 *
 * STATUS: REQUIRES MANUAL SETUP
 *
 * The external API (api.zaycev.net/external) requires:
 *   1. A valid ZAYCEV_STATIC_KEY — obtained by reverse-engineering the current
 *      Android APK (the 2016 key "kmskoNdkYHDnl3ol3" is no longer accepted).
 *   2. A server IP inside Russia/CIS — audio CDN is geo-restricted.
 *
 * To enable: set ZAYCEV_STATIC_KEY=<current key> in backend/.env.
 * Without a valid key this provider silently returns no results.
 *
 * Auth flow (when key is set):
 *   GET /external/hello → { token }
 *   MD5(token + STATIC_KEY) → hash
 *   GET /external/auth?code={token}&hash={hash} → { token: access_token }
 *   All subsequent requests pass ?access_token=...
 */

import crypto from 'crypto';
import { BaseProvider, SearchOptions } from './base.provider';
import { TrackMeta, SearchResult } from '../../types';
import { redis } from '../redis.client';
import { logger } from '../../utils/logger';

const ZAYCEV_BASE = 'https://api.zaycev.net/external';

// The static key MUST be provided via env. The 2016 key is dead.
const getStaticKey = (): string | null => {
  const key = process.env.ZAYCEV_STATIC_KEY;
  if (!key || key === 'kmskoNdkYHDnl3ol3') return null; // old dead key → disabled
  return key;
};

// In-memory token store
let tokenCache: { accessToken: string; expiresAt: number } | null = null;

interface ZaycevTrackItem {
  id: number;
  title?: string;
  name?: string;   // older API field
  duration: number;
  image?: string;
  artist?: { name: string };
  artistName?: string; // older API field
  album?: { title: string; image?: string };
}

interface ZaycevSearchResponse {
  results?: ZaycevTrackItem[];
  tracks?: ZaycevTrackItem[];
  total?: number;
  error?: { code: number; text: string };
}

interface ZaycevPlayResponse {
  url?: string;
  file_url?: string;
  mp3?: string;
  token?: string; // auth response uses 'token', not 'access_token'
}

async function fetchAccessToken(): Promise<string> {
  const staticKey = getStaticKey();
  if (!staticKey) throw new Error('Zaycev: ZAYCEV_STATIC_KEY not set or is outdated');

  if (tokenCache && Date.now() < tokenCache.expiresAt - 5 * 60 * 1000) {
    return tokenCache.accessToken;
  }

  const helloRes = await fetch(`${ZAYCEV_BASE}/hello`, {
    headers: { 'User-Agent': 'okhttp/4.9.0' }, // match Android client UA
  });
  if (!helloRes.ok) throw new Error(`Zaycev /hello failed: ${helloRes.status}`);
  const helloData = (await helloRes.json()) as { token: string };
  const { token } = helloData;

  const hash = crypto.createHash('md5').update(token + staticKey).digest('hex');
  const authUrl = `${ZAYCEV_BASE}/auth?code=${encodeURIComponent(token)}&hash=${encodeURIComponent(hash)}`;

  const authRes = await fetch(authUrl, {
    headers: { 'User-Agent': 'okhttp/4.9.0' },
  });
  if (!authRes.ok) throw new Error(`Zaycev /auth failed: ${authRes.status} — static key may be outdated`);

  // API returns { token: "..." } (not access_token)
  const authData = (await authRes.json()) as { token?: string; access_token?: string };
  const accessToken = authData.access_token ?? authData.token;
  if (!accessToken) throw new Error('Zaycev /auth: no token in response');

  tokenCache = { accessToken, expiresAt: Date.now() + 20 * 60 * 60 * 1000 };
  logger.info('Zaycev: obtained new access token');
  return accessToken;
}

const streamUrlCache = new Map<string, { url: string; expiresAt: number }>();

function getCachedStream(id: string): string | null {
  const e = streamUrlCache.get(id);
  if (!e || Date.now() > e.expiresAt) { streamUrlCache.delete(id); return null; }
  return e.url;
}

export class ZaycevProvider extends BaseProvider {
  readonly name = 'zaycev';

  async search(opts: SearchOptions): Promise<SearchResult> {
    const { query, page = 1, limit = 20 } = opts;

    if (!getStaticKey()) {
      return { tracks: [], albums: [], total: 0, page, limit };
    }

    const cacheKey = `zaycev:search:${Buffer.from(query).toString('base64')}:${page}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SearchResult;

    try {
      const accessToken = await fetchAccessToken();
      const url =
        `${ZAYCEV_BASE}/search` +
        `?query=${encodeURIComponent(query)}` +
        `&page=${page}` +
        `&type=track` +
        `&sort=popularity` +
        `&access_token=${encodeURIComponent(accessToken)}`;

      const res = await fetch(url, { headers: { 'User-Agent': 'okhttp/4.9.0' } });
      if (!res.ok) {
        logger.warn(`Zaycev search HTTP ${res.status} for query: ${query}`);
        return { tracks: [], albums: [], total: 0, page, limit };
      }

      const data = (await res.json()) as ZaycevSearchResponse;
      if (data.error) {
        logger.warn(`Zaycev search API error: ${data.error.text}`);
        return { tracks: [], albums: [], total: 0, page, limit };
      }

      const items = data.results ?? data.tracks ?? [];
      const tracks: TrackMeta[] = items.map((item) => this.trackToMeta(item));

      const result: SearchResult = {
        tracks,
        albums: [],
        total: data.total ?? tracks.length,
        page,
        limit,
      };

      await redis.setex(cacheKey, 3600, JSON.stringify(result));
      return result;
    } catch (err) {
      logger.warn('Zaycev search failed (provider may need new static key)', { err: String(err) });
      return { tracks: [], albums: [], total: 0, page, limit };
    }
  }

  async getTrackMeta(providerId: string): Promise<TrackMeta> {
    // Minimal meta — detailed meta only available via search
    return {
      id: `zaycev:${providerId}`,
      provider: 'zaycev',
      providerId: String(providerId),
      title: `Track ${providerId}`,
      artist: 'Unknown',
      score: 0.7,
    };
  }

  async getStreamUrl(providerId: string): Promise<string> {
    if (!getStaticKey()) {
      throw new Error('Zaycev provider is disabled: set ZAYCEV_STATIC_KEY in .env');
    }

    const memCached = getCachedStream(providerId);
    if (memCached) return memCached;

    const redisCacheKey = `zaycev:stream:${providerId}`;
    const redisCached = await redis.get(redisCacheKey);
    if (redisCached) { streamUrlCache.set(providerId, { url: redisCached, expiresAt: Date.now() + 30 * 60 * 1000 }); return redisCached; }

    const accessToken = await fetchAccessToken();
    const playUrl = `${ZAYCEV_BASE}/track/${encodeURIComponent(providerId)}/play?access_token=${encodeURIComponent(accessToken)}`;

    const res = await fetch(playUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'okhttp/4.9.0' },
    });
    if (!res.ok) throw new Error(`Zaycev stream HTTP ${res.status} for track ${providerId}`);

    let streamUrl: string | undefined;
    const finalUrl = res.url;
    const ct = res.headers.get('content-type') ?? '';

    if (finalUrl !== playUrl && (ct.startsWith('audio/') || /\.(mp3|m4a|ogg|aac)(\?|$)/i.test(finalUrl))) {
      streamUrl = finalUrl;
    } else {
      try {
        const body = (await res.json()) as ZaycevPlayResponse;
        streamUrl = body.url ?? body.file_url ?? body.mp3;
      } catch {
        if (finalUrl && finalUrl !== playUrl) streamUrl = finalUrl;
      }
    }

    if (!streamUrl) throw new Error(`Zaycev: could not resolve stream URL for track ${providerId}`);

    streamUrlCache.set(providerId, { url: streamUrl, expiresAt: Date.now() + 30 * 60 * 1000 });
    await redis.setex(redisCacheKey, 30 * 60, streamUrl);
    return streamUrl;
  }

  private trackToMeta(item: ZaycevTrackItem): TrackMeta {
    const title = item.title ?? item.name ?? 'Unknown';
    const artist = item.artist?.name ?? item.artistName ?? 'Unknown';
    const artwork = item.album?.image ?? item.image
      ?? (item.id ? `https://cdnimg.zaycev.net/commonImage/track/${item.id}/square250.jpg` : undefined);
    return {
      id: `zaycev:${item.id}`,
      provider: 'zaycev',
      providerId: String(item.id),
      title,
      artist,
      album: item.album?.title,
      duration: item.duration,
      artworkUrl: artwork,
      score: 0.8,
    };
  }
}
