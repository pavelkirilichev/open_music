/**
 * VK Music provider
 *
 * Requires VK_ACCESS_TOKEN in backend/.env — a user access token with the
 * "audio" scope. Standard VK apps don't expose audio, so the token must
 * come from a native mobile client (Kate Mobile, Boom, official VK app).
 *
 * How to get the token:
 *   Option A: vkaudiotoken CLI — pip install vkaudiotoken && python -m vkaudiotoken
 *   Option B: intercept Kate Mobile Android login via mitmproxy
 *
 * Auth flow (done once, token is long-lived):
 *   VK_ACCESS_TOKEN=vk1.a.xxxxxxx  →  all API calls pass ?access_token=...
 *
 * API: https://api.vk.com/method/audio.search  (v5.131)
 * Audio URLs are time-limited (~8h); cached in Redis with 1h TTL.
 */

import { BaseProvider, SearchOptions } from './base.provider';
import { TrackMeta, SearchResult } from '../../types';
import { redis } from '../redis.client';
import { logger } from '../../utils/logger';

const VK_API = 'https://api.vk.com/method';
const VK_VER = '5.131';

// Kate Mobile UA — required for audio API access
const KATE_UA = 'KateMobileAndroid/56 lite-445 (Android 4.4.2; SDK 19; x86; unknown Android SDK built for x86; en)';

function getToken(): string | null {
  return process.env.VK_ACCESS_TOKEN || null;
}

interface VkThumb {
  photo_34?: string;
  photo_68?: string;
  photo_135?: string;
  photo_270?: string;
  photo_300?: string;
  photo_600?: string;
  photo_1200?: string;
}

interface VkAudio {
  id: number;
  owner_id: number;
  artist: string;
  title: string;
  duration: number; // seconds
  url: string; // direct audio URL (empty string if unavailable/geo-blocked)
  thumb?: VkThumb;
  album?: { id?: number; title?: string; access_key?: string; thumb?: VkThumb };
}

interface VkResponse<T> {
  response?: T;
  error?: { error_code: number; error_msg: string };
}

interface VkSearchResult {
  count: number;
  items: VkAudio[];
}

async function vkCall<T>(method: string, params: Record<string, string | number>): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('VK_ACCESS_TOKEN not set');

  const qs = new URLSearchParams({
    access_token: token,
    v: VK_VER,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });

  const res = await fetch(`${VK_API}/${method}?${qs}`, {
    headers: { 'User-Agent': KATE_UA },
  });

  if (!res.ok) throw new Error(`VK API HTTP ${res.status}`);

  const data = (await res.json()) as VkResponse<T>;
  if (data.error) {
    throw new Error(`VK API error ${data.error.error_code}: ${data.error.error_msg}`);
  }
  if (!data.response) throw new Error('VK API: empty response');
  return data.response;
}

export class VkProvider extends BaseProvider {
  readonly name = 'vk';

  async search(opts: SearchOptions): Promise<SearchResult> {
    const { query, page = 1, limit = 20 } = opts;

    if (!getToken()) return { tracks: [], albums: [], total: 0, page, limit };

    const cacheKey = `vk:search:${Buffer.from(query).toString('base64')}:${page}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SearchResult;

    try {
      const offset = (page - 1) * limit;
      const result = await vkCall<VkSearchResult>('audio.search', {
        q: query,
        count: limit,
        offset,
        sort: 1, // 1 = by popularity
        auto_complete: 1,
      });

      // Skip tracks without a streamable URL (geo-blocked / rights-restricted)
      const tracks: TrackMeta[] = result.items
        .filter((t) => t.url && !t.url.includes('.m3u8')) // drop HLS for now
        .map((t) => this.toMeta(t));

      // Cache stream URLs alongside search results (they share the same TTL)
      await Promise.all(
        result.items
          .filter((t) => t.url && !t.url.includes('.m3u8'))
          .map((t) =>
            redis.setex(`vk:stream:${t.owner_id}_${t.id}`, 3600, t.url),
          ),
      );

      const out: SearchResult = {
        tracks,
        albums: [],
        total: result.count,
        page,
        limit,
      };
      await redis.setex(cacheKey, 3600, JSON.stringify(out));
      return out;
    } catch (err) {
      logger.warn('VK search failed', { err: String(err) });
      return { tracks: [], albums: [], total: 0, page, limit };
    }
  }

  async getTrackMeta(providerId: string): Promise<TrackMeta> {
    const cacheKey = `vk:meta:${providerId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as TrackMeta;

    try {
      const [item] = await vkCall<VkAudio[]>('audio.getById', { audios: providerId });
      if (!item) throw new Error(`VK track not found: ${providerId}`);
      const meta = this.toMeta(item);
      await redis.setex(cacheKey, 86400, JSON.stringify(meta));
      return meta;
    } catch {
      return {
        id: `vk:${providerId}`,
        provider: 'vk',
        providerId,
        title: `VK #${providerId}`,
        artist: 'Unknown',
        score: 0.7,
      };
    }
  }

  async getStreamUrl(providerId: string): Promise<string> {
    // 1. Check Redis cache (stream URLs expire in ~8h, we cache for 1h to be safe)
    const cacheKey = `vk:stream:${providerId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    // 2. Re-fetch from VK API
    const [item] = await vkCall<VkAudio[]>('audio.getById', { audios: providerId });
    if (!item?.url || item.url.includes('.m3u8')) {
      throw new Error(`VK: no streamable URL for ${providerId}`);
    }

    await redis.setex(cacheKey, 3600, item.url);
    return item.url;
  }

  private toMeta(t: VkAudio): TrackMeta {
    // VK returns artwork under album.thumb or directly on thumb; try best quality first
    const thumb = t.album?.thumb ?? t.thumb;
    const artwork = thumb?.photo_600 ?? thumb?.photo_300 ?? thumb?.photo_270 ?? thumb?.photo_135;
    return {
      id: `vk:${t.owner_id}_${t.id}`,
      provider: 'vk',
      providerId: `${t.owner_id}_${t.id}`,
      title: t.title,
      artist: t.artist,
      album: t.album?.title,
      duration: t.duration,
      artworkUrl: artwork,
      score: 0.9, // VK has high-quality metadata and wide catalog
    };
  }
}
