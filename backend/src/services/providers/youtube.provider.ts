import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { BaseProvider, SearchOptions } from './base.provider';
import { TrackMeta, SearchResult } from '../../types';
import { logger } from '../../utils/logger';
import { redis } from '../redis.client';

const execFileAsync = promisify(execFile);
const YT_API_KEY = process.env.YOUTUBE_API_KEY ?? '';

/**
 * Resolve yt-dlp command. Supports:
 *   - "yt-dlp"  (binary in PATH)
 *   - "python -m yt_dlp"  (pip-installed, no binary wrapper)
 */
function getYtdlpCmd(): { cmd: string; prefix: string[] } {
  const raw = (process.env.YTDLP_PATH ?? 'yt-dlp').trim();
  if (raw.includes(' ')) {
    const parts = raw.split(' ');
    return { cmd: parts[0], prefix: parts.slice(1) };
  }
  return { cmd: raw, prefix: [] };
}

async function runYtdlp(args: string[], timeoutMs = 30_000): Promise<string> {
  const { cmd, prefix } = getYtdlpCmd();
  const { stdout } = await execFileAsync(cmd, [...prefix, ...args], {
    timeout: timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout;
}

function spawnYtdlp(args: string[]): ReturnType<typeof spawn> {
  const { cmd, prefix } = getYtdlpCmd();
  return spawn(cmd, [...prefix, ...args], { stdio: 'pipe' });
}

interface YtDlpInfo {
  id: string;
  title: string;
  uploader?: string;
  channel?: string;
  album?: string;
  release_year?: number;
  duration?: number;
  thumbnail?: string;
  artist?: string;
  track?: string;
  creator?: string;
}

function parseYouTubeTitle(raw: string): { artist: string; title: string } | null {
  const cleaned = raw
    .replace(/\s*[\[(](?:Official\s*(?:Video|Audio|Music\s*Video)|Lyrics?|HD|HQ|4K|MV|Topic)[\])]?/gi, '')
    .replace(/\s*\|\s*.*$/, '')
    .trim();
  const match = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (match) {
    const artist = match[1].trim();
    const title = match[2].trim();
    if (artist.length > 0 && artist.length < 80 && title.length > 0) {
      return { artist, title };
    }
  }
  return null;
}

/** Filter out compilations, full albums, snippets — keep individual tracks only */
const COMPILATION_RE = /(?:compilation|best\s+of|full\s+album|полный\s+альбом|сборник|подборка|лучшие|топ\s+\d|playlist|плейлист|\bmix\b|\bмикс\b)/i;

function isIndividualTrack(t: TrackMeta): boolean {
  // No duration info → keep (can't filter)
  if (t.duration == null) return true;
  // Snippets < 30s
  if (t.duration < 30) return false;
  // Full albums / compilations > 10 min
  if (t.duration > 600) return false;
  // Title heuristics
  if (COMPILATION_RE.test(t.title)) return false;
  return true;
}

export class YoutubeProvider extends BaseProvider {
  readonly name = 'youtube';

  async search(opts: SearchOptions): Promise<SearchResult> {
    const { query, page = 1, limit = 20 } = opts;
    const cacheKey = `yt:search:${Buffer.from(query).toString('base64')}:${page}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SearchResult;

    // Fetch extra so we have enough after filtering compilations/snippets
    const raw = YT_API_KEY
      ? await this.searchViaApi(query, Math.min(limit * 2, 50))
      : await this.searchViaYtdlp(query, Math.min(limit * 2, 50));

    const tracks = raw.filter(isIndividualTrack).slice(0, limit);

    const result: SearchResult = { tracks, albums: [], total: tracks.length, page, limit };
    await redis.setex(cacheKey, 3600, JSON.stringify(result));
    return result;
  }

  private async searchViaApi(query: string, limit: number): Promise<TrackMeta[]> {
    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet&q=${encodeURIComponent(query + ' music audio')}` +
      `&type=video&videoCategoryId=10&maxResults=${limit}&key=${YT_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YT API error: ${res.status}`);
    const data = await res.json() as {
      items: Array<{
        id: { videoId: string };
        snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string } } };
      }>;
    };
    return data.items.map((item) => ({
      id: `youtube:${item.id.videoId}`,
      provider: 'youtube' as const,
      providerId: item.id.videoId,
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      artworkUrl: item.snippet.thumbnails.medium?.url,
      score: 0.8,
    }));
  }

  private async searchViaYtdlp(query: string, limit: number): Promise<TrackMeta[]> {
    try {
      const stdout = await runYtdlp([
        `ytsearch${limit}:${query} music`,
        '--dump-json',
        '--no-playlist',
        '--flat-playlist',
        '--skip-download',
        '--quiet',
      ], 45_000);
      return stdout.trim().split('\n').filter(Boolean).map((line) => {
        const info = JSON.parse(line) as YtDlpInfo;
        return this.infoToMeta(info);
      });
    } catch (err) {
      logger.error('yt-dlp search failed', { err });
      return [];
    }
  }

  async getTrackMeta(providerId: string): Promise<TrackMeta> {
    const cacheKey = `yt:meta:${providerId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as TrackMeta;

    const stdout = await runYtdlp([
      `https://www.youtube.com/watch?v=${providerId}`,
      '--dump-json', '--skip-download', '--quiet',
    ], 20_000);

    const info = JSON.parse(stdout) as YtDlpInfo;
    const meta = this.infoToMeta(info);
    await redis.setex(cacheKey, 7200, JSON.stringify(meta));
    return meta;
  }

  async getStreamUrl(providerId: string): Promise<string> {
    const cacheKey = `yt:stream:${providerId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    // Format priority: m4a (AAC) → mp4 audio → any audio
    // AAC/m4a is supported by ALL browsers; webm/opus fails on Safari and some mobile browsers.
    // Format 140 = YouTube's standard 128kbps AAC m4a (always available).
    const stdout = await runYtdlp([
      `https://www.youtube.com/watch?v=${providerId}`,
      '--get-url', '-f', '140/bestaudio[ext=m4a]/bestaudio[acodec=mp4a.40.2]/bestaudio[ext=mp4]/bestaudio',
      '--quiet',
    ], 25_000);

    const url = stdout.trim().split('\n')[0];
    if (!url) throw new Error(`No stream URL for YouTube:${providerId}`);

    // YouTube CDN URLs expire; keep TTL well under their window (~6h)
    await redis.setex(cacheKey, 20 * 60, url);
    return url;
  }

  // Expose spawnYtdlp for cacheAudio.job.ts
  static spawn(args: string[]) {
    return spawnYtdlp(args);
  }

  private infoToMeta(info: YtDlpInfo): TrackMeta {
    // Priority: embedded music tags > title parsing > channel name
    let artist: string | null = info.artist ?? info.creator ?? null;
    let title: string | null = info.track ?? null;

    if (!artist || !title) {
      const parsed = parseYouTubeTitle(info.title);
      if (parsed) {
        if (!artist) artist = parsed.artist;
        if (!title) title = parsed.title;
      }
    }

    artist = artist ?? info.channel ?? info.uploader ?? 'Unknown';
    title = title ?? info.title;

    // Always construct thumbnail from video ID (works for all public videos)
    const artworkUrl = info.thumbnail ?? `https://i.ytimg.com/vi/${info.id}/mqdefault.jpg`;

    return {
      id: `youtube:${info.id}`,
      provider: 'youtube',
      providerId: info.id,
      title,
      artist,
      album: info.album,
      duration: info.duration,
      artworkUrl,
      year: info.release_year,
      score: 0.7,
    };
  }
}
