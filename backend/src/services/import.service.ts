/**
 * Import service — fetch liked tracks/albums from external services
 * (Yandex Music, VK Music) and match them to YouTube via search.
 */

import https from 'https';
import { logger } from '../utils/logger';

// ─── Yandex Music ───────────────────────────────────────────────────────────

const YM_API = 'https://api.music.yandex.net';

interface YmTrackShort {
  id: number | string;
  title?: string;
  artists?: Array<{ name: string }>;
  albums?: Array<{ id: number; title?: string }>;
  durationMs?: number;
}

interface YmAlbumShort {
  id: number;
  title: string;
  artists?: Array<{ name: string }>;
  year?: number;
  coverUri?: string;
}

export interface ImportedTrack {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
}

export interface ImportedAlbum {
  title: string;
  artist: string;
  year?: number;
  coverUrl?: string;
}

export interface ImportResult {
  tracks: ImportedTrack[];
  albums: ImportedAlbum[];
  errors: string[];
}

/**
 * Node.js built-in fetch (undici) gets 403 from Yandex due to TLS fingerprinting.
 * Using native https module which works fine.
 */
function httpsRequest(url: string, options: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function ymFetch<T>(path: string, token: string): Promise<T> {
  const res = await httpsRequest(`${YM_API}${path}`, {
    headers: {
      Authorization: `OAuth ${token}`,
      'Accept-Language': 'ru',
    },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`YM API ${res.status}: ${res.body.slice(0, 200)}`);
  }
  const json = JSON.parse(res.body);
  return json.result ?? json;
}

async function ymPost<T>(path: string, token: string, body: string): Promise<T> {
  const res = await httpsRequest(`${YM_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Language': 'ru',
    },
    body,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`YM API POST ${res.status}: ${res.body.slice(0, 200)}`);
  }
  const json = JSON.parse(res.body);
  return json.result ?? json;
}

export async function importYandexMusic(token: string): Promise<ImportResult> {
  const errors: string[] = [];
  const tracks: ImportedTrack[] = [];
  const albums: ImportedAlbum[] = [];

  // 1. Get user ID from account status
  let uid: number | string;
  try {
    const status = await ymFetch<{ account: { uid: number } }>('/account/status', token);
    uid = status.account.uid;
  } catch (err) {
    logger.warn('YM: failed to get account status', { err: String(err) });
    return { tracks: [], albums: [], errors: ['Не удалось получить аккаунт. Проверьте токен.'] };
  }

  // 2. Fetch liked tracks
  try {
    const likesData = await ymFetch<{ library: { tracks: Array<{ id: string | number }> } }>(
      `/users/${uid}/likes/tracks`,
      token,
    );
    const trackIds = (likesData.library?.tracks ?? []).map((t) => t.id);

    if (trackIds.length > 0) {
      // Fetch full track info in batches of 100
      for (let i = 0; i < trackIds.length; i += 100) {
        const batch = trackIds.slice(i, i + 100);
        try {
          const body = `track-ids=${batch.join(',')}`;
          const items = await ymPost<YmTrackShort[]>('/tracks', token, body);
          const trackList = Array.isArray(items) ? items : [];
          for (const t of trackList) {
            if (!t.title) continue;
            tracks.push({
              title: t.title,
              artist: (t.artists ?? []).map((a) => a.name).join(', ') || 'Unknown',
              album: t.albums?.[0]?.title,
              duration: t.durationMs ? Math.round(t.durationMs / 1000) : undefined,
            });
          }
        } catch (err) {
          errors.push(`Ошибка загрузки треков (batch ${i}): ${String(err)}`);
        }
      }
    }
  } catch (err) {
    errors.push(`Ошибка загрузки лайкнутых треков: ${String(err)}`);
  }

  // 3. Fetch liked albums (API returns only IDs, need to fetch details)
  try {
    const likesAlbums = await ymFetch<Array<{ id: number }>>(
      `/users/${uid}/likes/albums`,
      token,
    );
    const albumIds = (Array.isArray(likesAlbums) ? likesAlbums : []).map((a) => a.id);

    // Fetch album details in batches of 20
    for (let i = 0; i < albumIds.length; i += 20) {
      const batch = albumIds.slice(i, i + 20);
      for (const albumId of batch) {
        try {
          const a = await ymFetch<YmAlbumShort>(`/albums/${albumId}`, token);
          albums.push({
            title: a.title,
            artist: (a.artists ?? []).map((ar) => ar.name).join(', ') || 'Unknown',
            year: a.year,
            coverUrl: a.coverUri ? `https://${a.coverUri.replace('%%', '400x400')}` : undefined,
          });
        } catch {
          // skip individual album errors
        }
      }
    }
  } catch (err) {
    errors.push(`Ошибка загрузки альбомов: ${String(err)}`);
  }

  logger.info(`YM import: ${tracks.length} tracks, ${albums.length} albums for uid=${uid}`);
  return { tracks, albums, errors };
}

// ─── VK Music ───────────────────────────────────────────────────────────────

const VK_API = 'https://api.vk.com/method';
const VK_VER = '5.131';
const KATE_UA = 'KateMobileAndroid/56 lite-445 (Android 4.4.2; SDK 19; x86; unknown Android SDK built for x86; en)';

interface VkAudioItem {
  id: number;
  owner_id: number;
  artist: string;
  title: string;
  duration: number;
  album?: { id?: number; title?: string };
}

interface VkAudioResponse {
  count: number;
  items: VkAudioItem[];
}

export async function importVkMusic(token: string): Promise<ImportResult> {
  const errors: string[] = [];
  const tracks: ImportedTrack[] = [];
  const albums: ImportedAlbum[] = [];
  const seenAlbums = new Set<string>();

  try {
    let offset = 0;
    const batchSize = 200;
    let total = Infinity;

    while (offset < total && offset < 5000) {
      const qs = new URLSearchParams({
        access_token: token,
        v: VK_VER,
        count: String(batchSize),
        offset: String(offset),
      });

      const res = await httpsRequest(`${VK_API}/audio.get?${qs}`, {
        headers: { 'User-Agent': KATE_UA },
      });

      if (res.status < 200 || res.status >= 300) {
        errors.push(`VK API HTTP ${res.status}`);
        break;
      }

      const json = JSON.parse(res.body);
      if (json.error) {
        errors.push(`VK ошибка: ${json.error.error_msg || json.error.error_code}`);
        break;
      }

      const data: VkAudioResponse = json.response;
      if (!data) break;

      total = data.count;

      for (const item of data.items) {
        tracks.push({
          title: item.title,
          artist: item.artist,
          album: item.album?.title,
          duration: item.duration,
        });

        // Collect unique albums
        if (item.album?.title) {
          const key = `${item.artist}|${item.album.title}`.toLowerCase();
          if (!seenAlbums.has(key)) {
            seenAlbums.add(key);
            albums.push({
              title: item.album.title,
              artist: item.artist,
            });
          }
        }
      }

      offset += batchSize;

      // Small delay to avoid rate limits
      if (offset < total) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }
  } catch (err) {
    errors.push(`Ошибка импорта VK: ${String(err)}`);
  }

  logger.info(`VK import: ${tracks.length} tracks, ${albums.length} albums`);
  return { tracks, albums, errors };
}
