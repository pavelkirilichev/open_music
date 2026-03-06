/**
 * Rutracker.org provider
 *
 * Requires RUTRACKER_USERNAME and RUTRACKER_PASSWORD in backend/.env
 * (your personal Rutracker account credentials).
 *
 * Search: scrapes HTML search results (no API).
 * Stream: downloads .torrent file and streams via WebTorrent.
 *
 * Note: Rutracker contains copyrighted content. Use only in jurisdictions
 * where this is permitted or for personal use.
 */

import * as cheerio from 'cheerio';
import WebTorrent from 'webtorrent';
import path from 'path';
import os from 'os';
import { Response } from 'express';
import { BaseProvider, SearchOptions } from './base.provider';
import { TrackMeta, SearchResult } from '../../types';
import { redis } from '../redis.client';
import { logger } from '../../utils/logger';

const RT_BASE = 'https://rutracker.org/forum';
const CACHE_DIR = path.join(os.tmpdir(), 'open-music-rutracker');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Auth ────────────────────────────────────────────────────────────────────

let rtCookie: string | null = null;
let rtCookieExpiresAt = 0;

async function login(): Promise<string | null> {
  const username = process.env.RUTRACKER_USERNAME;
  const password = process.env.RUTRACKER_PASSWORD;
  if (!username || !password) return null;

  const body = new URLSearchParams({
    login_username: username,
    login_password: password,
    login: 'вход',
  });

  const res = await fetch(`${RT_BASE}/login.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      'Referer': 'https://rutracker.org/forum/login.php',
    },
    body: body.toString(),
    redirect: 'manual',
  });

  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/bb_session=[^;]+/);
  if (!match) {
    logger.warn('Rutracker: login failed — check credentials');
    return null;
  }

  rtCookie = match[0];
  rtCookieExpiresAt = Date.now() + 12 * 3600 * 1000; // 12 hours
  logger.info('Rutracker: session established');
  return rtCookie;
}

async function getCookie(): Promise<string | null> {
  if (rtCookie && Date.now() < rtCookieExpiresAt) return rtCookie;
  return login();
}

function authHeaders(cookie: string): Record<string, string> {
  return {
    Cookie: cookie,
    'User-Agent': UA,
    Referer: 'https://rutracker.org/forum/',
  };
}

// ─── HTML parsing ─────────────────────────────────────────────────────────────

/**
 * Parse Rutracker torrent title into structured fields.
 *
 * Common formats on Rutracker:
 *   (Genre) [LP] [24/96] Artist ◆ Album Year (Edition) - 1969, FLAC (tracks)
 *   [RM] (Genre) Artist ◆ Album - 2021, MP3
 *   Artist - Album (Year) [Format]
 */
function parseTorrentTitle(raw: string): { artist: string; album: string; year?: number } {
  let s = raw.trim();

  // 1. Strip leading tag blocks: [RM] [TR24] etc.
  s = s.replace(/^(?:\[[^\]]*\]\s*)+/, '');

  // 2. Strip leading genre block: (Classic Rock, Pop) etc.
  s = s.replace(/^\([^)]+\)\s*/, '');

  // 3. Strip remaining leading format tags: [LP] [24/96] [7"] etc.
  s = s.replace(/^(?:\[[^\]]*\]\s*)+/, '');

  // 4. Strip trailing "- YEAR[/YEAR], format info"
  s = s.replace(/\s+-\s+\d{4}(?:\/\d{4})?,\s*.+$/, '').trim();

  // 5. Strip trailing ", FORMAT, quality" without a dash (e.g. ", APE (image+.cue), lossless")
  s = s.replace(/,\s*(?:FLAC|MP3|AAC|APE|WAV|ALAC|OGG|lossless)\b.*/i, '').trim();

  // 6. Artist ◆ Album — the standard Rutracker separator
  const bulletIdx = s.indexOf(' \u25C6 ');
  if (bulletIdx !== -1) {
    const artist = s.slice(0, bulletIdx).trim();
    let album = s.slice(bulletIdx + 3).trim();

    // Extract year before stripping parenthetical content
    const yearMatch = album.match(/\b((?:19|20)\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1]) : undefined;

    // Strip trailing edition/pressing in (...) — e.g. (MFSL 1985 Half Speed Mastered LP)
    album = album.replace(/\s*\([^)]*\)\s*$/, '').trim();
    // Strip trailing remaster/vinyl tags in [...]
    album = album.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
    // Strip lone year at end: "Abbey Road 1969" → "Abbey Road"
    album = album.replace(/\s+(?:19|20)\d{2}$/, '').trim();

    return { artist, album: album || s.slice(bulletIdx + 3).trim(), year };
  }

  // 7. Fallback: Artist - Album (Year)
  const m = s.match(/^(.+?)\s+-\s+(.+?)(?:\s+\((\d{4})\))?$/);
  if (m) {
    return { artist: m[1].trim(), album: m[2].trim(), year: m[3] ? parseInt(m[3]) : undefined };
  }

  return { artist: 'Unknown', album: s };
}

function parseSearchHtml(html: string): TrackMeta[] {
  const $ = cheerio.load(html);
  const tracks: TrackMeta[] = [];

  $('#tor-tbl tr.tCenter.hl-tr').each((_, row) => {
    const titleEl = $(row).find('a.tLink');
    if (!titleEl.length) return;

    const rawTitle = titleEl.text().trim();
    const href = titleEl.attr('href') ?? '';
    const idMatch = href.match(/[?&]t=(\d+)/);
    if (!idMatch) return;

    const torrentId = idMatch[1];
    const seeders = parseInt($(row).find('.seedmed b, .seedmed').first().text()) || 0;
    // Skip dead torrents (no seeders) — they won't download
    if (seeders === 0) return;

    const { artist, album, year } = parseTorrentTitle(rawTitle);

    tracks.push({
      id: `rutracker:${torrentId}`,
      provider: 'rutracker',
      providerId: torrentId,
      title: album,
      artist,
      album,
      year,
      // Score: base 0.7 + bonus for active seeders (up to 0.25)
      score: Math.min(0.95, 0.7 + Math.log10(Math.max(1, seeders)) * 0.08),
    });
  });

  return tracks;
}

// ─── WebTorrent ───────────────────────────────────────────────────────────────

let wtInstance: WebTorrent.Instance | null = null;

function getWt(): WebTorrent.Instance {
  if (!wtInstance) {
    wtInstance = new WebTorrent();
    wtInstance.on('error', (err) => logger.error('WebTorrent error', { err }));
  }
  return wtInstance;
}

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  wav: 'audio/wav',
};

// Sort preference: lossy (fast start) over lossless
const EXT_PRIORITY: Record<string, number> = { mp3: 1, m4a: 2, aac: 3, ogg: 4, flac: 5, wav: 6 };

function pickAudioFile(files: WebTorrent.TorrentFile[]): WebTorrent.TorrentFile | undefined {
  const audio = files.filter((f) => /\.(mp3|m4a|flac|ogg|aac|wav)$/i.test(f.name));
  if (!audio.length) return undefined;
  return audio.sort((a, b) => {
    const ea = a.name.split('.').pop()?.toLowerCase() ?? '';
    const eb = b.name.split('.').pop()?.toLowerCase() ?? '';
    return (EXT_PRIORITY[ea] ?? 9) - (EXT_PRIORITY[eb] ?? 9);
  })[0];
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class RutrackerProvider extends BaseProvider {
  readonly name = 'rutracker';

  async search(opts: SearchOptions): Promise<SearchResult> {
    const { query, page = 1, limit = 20 } = opts;

    const cookie = await getCookie();
    if (!cookie) return { tracks: [], albums: [], total: 0, page, limit };

    const cacheKey = `rutracker:search:${Buffer.from(query).toString('base64')}:${page}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SearchResult;

    try {
      // cat=400 = all music; for Russian only use cat=403
      const url = `${RT_BASE}/tracker.php?nm=${encodeURIComponent(query)}&cat=400`;
      let res = await fetch(url, { headers: authHeaders(cookie) });

      // If redirected to login → session expired, re-auth once
      const html = await res.text();
      if (html.includes('login_username') && html.includes('login.php')) {
        rtCookie = null;
        const fresh = await login();
        if (!fresh) return { tracks: [], albums: [], total: 0, page, limit };
        res = await fetch(url, { headers: authHeaders(fresh) });
      }

      const finalHtml = html.includes('login_username') ? await res.text() : html;
      const tracks = parseSearchHtml(finalHtml).slice(0, limit);
      const result: SearchResult = { tracks, albums: [], total: tracks.length, page, limit };
      await redis.setex(cacheKey, 3600, JSON.stringify(result));
      return result;
    } catch (err) {
      logger.warn('Rutracker search failed', { err: String(err) });
      return { tracks: [], albums: [], total: 0, page, limit };
    }
  }

  async getTrackMeta(providerId: string): Promise<TrackMeta> {
    return {
      id: `rutracker:${providerId}`,
      provider: 'rutracker',
      providerId,
      title: `Rutracker #${providerId}`,
      artist: 'Unknown',
      score: 0.7,
    };
  }

  async getStreamUrl(_providerId: string): Promise<string> {
    // Not used — streamDirect handles everything
    throw new Error('Use streamDirect for rutracker');
  }

  async streamDirect(providerId: string, rangeHeader: string | undefined, res: Response): Promise<void> {
    const cookie = await getCookie();
    if (!cookie) throw new Error('Rutracker: not authenticated');

    // 1. Get the .torrent file (cached in Redis as base64)
    const torrentBuf = await this.fetchTorrent(providerId, cookie);

    // 2. Add to WebTorrent and stream the first audio file
    return new Promise<void>((resolve, reject) => {
      const wt = getWt();

      // Check if already added
      const existing = wt.torrents.find((t) => t.comment === `rutracker:${providerId}`);
      const torrent = existing ?? wt.add(torrentBuf, {
        path: CACHE_DIR,
        // Store a tag so we can find it later
      });

      const serve = (t: WebTorrent.Torrent) => {
        const file = pickAudioFile(t.files);
        if (!file) { reject(new Error('No audio file found in torrent')); return; }

        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp3';
        const mime = MIME[ext] ?? 'audio/mpeg';
        const total = file.length;

        // Parse range
        let start = 0;
        let end = total - 1;
        if (rangeHeader) {
          const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (m) {
            start = parseInt(m[1]);
            end = m[2] ? parseInt(m[2]) : end;
          }
        }
        const length = end - start + 1;

        if (rangeHeader) {
          res.writeHead(206, {
            'Content-Type': mime,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': length,
            'X-Provider': 'rutracker',
          });
        } else {
          res.writeHead(200, {
            'Content-Type': mime,
            'Accept-Ranges': 'bytes',
            'Content-Length': total,
            'X-Provider': 'rutracker',
          });
        }

        // Prioritise downloading from the selected range
        file.select();
        const stream = file.createReadStream({ start, end });
        stream.pipe(res);
        stream.on('end', resolve);
        stream.on('error', reject);
        res.on('close', () => { (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.(); resolve(); });
      };

      if (torrent.ready) {
        serve(torrent);
      } else {
        torrent.once('ready', () => serve(torrent));
        torrent.once('error', reject);
      }
    });
  }

  private async fetchTorrent(torrentId: string, cookie: string): Promise<Buffer> {
    const cacheKey = `rutracker:torrent:${torrentId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return Buffer.from(cached, 'base64');

    const res = await fetch(`${RT_BASE}/dl.php?t=${torrentId}`, {
      headers: authHeaders(cookie),
    });
    if (!res.ok) throw new Error(`Rutracker: .torrent download failed (HTTP ${res.status})`);

    const buf = Buffer.from(await res.arrayBuffer());
    // Cache .torrent file for 24h
    await redis.setex(cacheKey, 86400, buf.toString('base64'));
    return buf;
  }
}
