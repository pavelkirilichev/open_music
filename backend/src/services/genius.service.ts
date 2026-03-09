import * as cheerio from 'cheerio';
import { redis } from './redis.client';
import { logger } from '../utils/logger';

const GENIUS_SEARCH_URL = 'https://genius.com/api/search/song';
const GENIUS_BASE_URL = 'https://genius.com';
const GENIUS_CACHE_TTL_SEC = 60 * 60 * 12;
const GENIUS_EMPTY_CACHE_TTL_SEC = 60 * 10;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface GeniusTrackResult {
  id: number;
  title: string;
  artist: string;
  url: string;
  artworkUrl: string | null;
  lyrics: string | null;
}

export interface GeniusTrackPayload {
  source: 'genius';
  track: GeniusTrackResult | null;
}

interface GeniusSearchHit {
  result?: {
    id?: number;
    title?: string;
    full_title?: string;
    artist_names?: string;
    url?: string;
    song_art_image_thumbnail_url?: string;
    song_art_image_url?: string;
    primary_artist?: { name?: string };
  };
}

interface GeniusSearchResponse {
  response?: {
    sections?: Array<{
      type?: string;
      hits?: GeniusSearchHit[];
    }>;
  };
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\d]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function tokenScore(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  const queryTokens = query.split(' ').filter(Boolean);
  if (!queryTokens.length) return 0;
  let matches = 0;
  for (const token of queryTokens) {
    if (candidate.includes(token)) matches += 1;
  }
  return matches / queryTokens.length;
}

function scoreHit(hit: GeniusSearchHit, title: string, artist: string): number {
  const result = hit.result;
  if (!result) return -1;

  const queryTitle = normalizeForMatch(title);
  const queryArtist = normalizeForMatch(artist);
  const hitTitle = normalizeForMatch(result.title ?? result.full_title ?? '');
  const hitArtist = normalizeForMatch(result.primary_artist?.name ?? result.artist_names ?? '');

  // Bidirectional token score: query→candidate AND candidate→query
  const titleScore = Math.max(
    tokenScore(queryTitle, hitTitle),
    tokenScore(hitTitle, queryTitle),
  );
  const artistScore = Math.max(
    tokenScore(queryArtist, hitArtist),
    tokenScore(hitArtist, queryArtist),
  );
  let score = titleScore * 0.7 + artistScore * 0.3;

  if (queryTitle && hitTitle && (hitTitle.includes(queryTitle) || queryTitle.includes(hitTitle))) {
    score += 0.2;
  }
  if (queryArtist && hitArtist && (hitArtist.includes(queryArtist) || queryArtist.includes(hitArtist))) {
    score += 0.1;
  }
  return score;
}

const MIN_SCORE = 0.45;

function extractCookieHeader(headers: Headers): string {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    return withGetSetCookie
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0]?.trim())
      .filter(Boolean)
      .join('; ');
  }

  const raw = headers.get('set-cookie');
  if (!raw) return '';

  return raw
    .split(/,(?=[^;,=\s]+=[^;,]+)/g)
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

function cleanLyricsChunk(raw: string): string {
  const noiseLinePatterns = [
    /contributors?/i,
    /translations?/i,
    /romanization/i,
    /read more/i,
    /you might also like/i,
    /^embed$/i,
    /^lyrics$/i,
    /\blyrics\b/i,
    /<img/i,
    /^src=/i,
    /^class=/i,
    /noscript/i,
  ];

  const lines = raw
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return '';

  let filtered = lines.filter((line) => !noiseLinePatterns.some((pattern) => pattern.test(line)));

  // Genius pages often prepend description/editorial text before first [Verse]/[Куплет] marker.
  const firstSectionLine = filtered.findIndex((line) => /^\[[^\]]+\]$/.test(line));
  if (firstSectionLine > 0) {
    filtered = filtered.slice(firstSectionLine);
  }

  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractLyricsFromHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const chunks: string[] = [];

  $('[data-lyrics-container="true"]').each((_, el) => {
    const block = $(el).clone();
    block.find('br').replaceWith('\n');
    const text = cleanLyricsChunk(block.text());

    if (text) chunks.push(text);
  });

  if (!chunks.length) return null;
  const lyrics = chunks.join('\n\n').trim();
  return lyrics || null;
}

async function geniusApiSearch(query: string): Promise<{ hits: GeniusSearchHit[]; cookieHeader: string }> {
  const url = `${GENIUS_SEARCH_URL}?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      Referer: `${GENIUS_BASE_URL}/`,
      Origin: GENIUS_BASE_URL,
      'x-requested-with': 'XMLHttpRequest',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`Genius search failed: ${response.status}`);
  const cookieHeader = extractCookieHeader(response.headers);
  const data = (await response.json()) as GeniusSearchResponse;
  const hits = data.response?.sections?.flatMap((s) => s.type === 'song' ? s.hits ?? [] : []) ?? [];
  return { hits, cookieHeader };
}

function pickBest(hits: GeniusSearchHit[], title: string, artist: string): { hit: GeniusSearchHit; score: number } | null {
  let bestHit: GeniusSearchHit | null = null;
  let bestScore = -1;
  for (const hit of hits) {
    const score = scoreHit(hit, title, artist);
    if (score > bestScore) { bestScore = score; bestHit = hit; }
  }
  return bestHit && bestScore >= 0 ? { hit: bestHit, score: bestScore } : null;
}

async function searchOnGenius(artist: string, title: string): Promise<{
  hit: GeniusSearchHit | null;
  cookieHeader: string;
}> {
  // Strip parenthetical content from title for a cleaner query
  const cleanTitle = title.replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, '').replace(/\s{2,}/g, ' ').trim();

  // Query strategies in priority order
  const queries = [
    `${artist} ${title}`,
    `${artist} ${cleanTitle}`,
    `${title} ${artist}`,
    cleanTitle !== title ? cleanTitle : null,
    title,
  ].filter((q, i, arr): q is string => Boolean(q) && arr.indexOf(q) === i);

  let lastCookieHeader = '';
  for (const query of queries) {
    try {
      const { hits, cookieHeader } = await geniusApiSearch(query);
      lastCookieHeader = cookieHeader || lastCookieHeader;
      const best = pickBest(hits, title, artist);
      if (best && best.score >= MIN_SCORE) {
        return { hit: best.hit, cookieHeader };
      }
    } catch {
      // try next query
    }
  }

  return { hit: null, cookieHeader: lastCookieHeader };
}

async function fetchLyricsFromSongPage(url: string, cookieHeader: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      Referer: `${GENIUS_BASE_URL}/`,
      'accept-language': 'en-US,en;q=0.9',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  return extractLyricsFromHtml(html);
}

function cacheKey(artist: string, title: string): string {
  return `genius:v2:${normalizeForMatch(artist)}:${normalizeForMatch(title)}`;
}

export async function getGeniusTrack(artist: string, title: string): Promise<GeniusTrackPayload> {
  const key = cacheKey(artist, title);
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as GeniusTrackPayload;
    } catch {
      // Ignore broken cache entry and rebuild
    }
  }

  try {
    const { hit, cookieHeader } = await searchOnGenius(artist, title);
    if (!hit?.result?.id || !hit.result.url) {
      const emptyPayload: GeniusTrackPayload = { source: 'genius', track: null };
      await redis.setex(key, GENIUS_EMPTY_CACHE_TTL_SEC, JSON.stringify(emptyPayload));
      return emptyPayload;
    }

    const lyrics = await fetchLyricsFromSongPage(hit.result.url, cookieHeader);
    const payload: GeniusTrackPayload = {
      source: 'genius',
      track: {
        id: hit.result.id,
        title: hit.result.title ?? '',
        artist: hit.result.primary_artist?.name ?? hit.result.artist_names ?? '',
        url: hit.result.url,
        artworkUrl: hit.result.song_art_image_thumbnail_url ?? hit.result.song_art_image_url ?? null,
        lyrics,
      },
    };

    await redis.setex(key, GENIUS_CACHE_TTL_SEC, JSON.stringify(payload));
    return payload;
  } catch (err) {
    logger.warn('Failed to fetch Genius track', {
      err: err instanceof Error ? err.message : String(err),
      artist,
      title,
    });
    return { source: 'genius', track: null };
  }
}
