import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.middleware';
import { logger } from '../utils/logger';
import { searchAll, getProvider } from '../services/providers/registry';
import { TrackMeta } from '../types';

export const artistsRouter = Router();

const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_UA = 'OpenMusic/1.0 (admin@openmusic.app)';
const CAA_BASE = 'https://coverartarchive.org/release-group';

// ─── Simple in-memory cache ───────────────────────────────────────────────────
interface CacheEntry {
  value: unknown;
  expiresAt: number;
}
const memCache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | null {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function cacheSet(key: string, value: unknown, ttlSeconds: number): void {
  memCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function clearMemCache(): void {
  memCache.clear();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── MusicBrainz types ────────────────────────────────────────────────────────

interface MBArtist {
  id: string;
  name: string;
  country?: string;
  disambiguation?: string;
}

interface MBArtistSearchResponse {
  artists: MBArtist[];
}

interface MBReleaseGroup {
  id: string;
  title: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'first-release-date'?: string;
}

interface MBReleaseGroupResponse {
  'release-groups': MBReleaseGroup[];
}

interface MBRecording {
  id: string;
  title: string;
  length?: number; // ms
  position?: number;
}

interface MBTrack {
  id: string;
  number: string;
  position: number;
  title: string;
  length?: number; // ms
  recording?: MBRecording;
}

interface MBMedium {
  position: number;
  tracks?: MBTrack[];
}

interface MBRelease {
  id: string;
  title: string;
  date?: string;
  'artist-credit'?: Array<{ artist: MBArtist }>;
  media?: MBMedium[];
}

interface MBReleaseResponse {
  releases: MBRelease[];
}

interface MBRecordingFull {
  id: string;
  title: string;
  length?: number; // ms
  'first-release-date'?: string;
  releases?: Array<{ title: string; date?: string; 'release-group'?: { id: string } }>;
}

interface MBRecordingsResponse {
  recordings: MBRecordingFull[];
  'recording-count': number;
  'recording-offset': number;
}

// ─── GET /api/artists/albums?name={artistName} ────────────────────────────────

const albumsQuerySchema = z.object({
  name: z.string().min(1).max(200),
});

artistsRouter.get(
  '/albums',
  validate(albumsQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { name } = req.query as z.infer<typeof albumsQuerySchema>;
      const cacheKey = `mb:artist:albums:${Buffer.from(name).toString('base64')}`;

      const cached = cacheGet<object>(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // Step 1: Find artist on MusicBrainz
      const artistSearchUrl =
        `${MB_BASE}/artist/?query=${encodeURIComponent(name)}&fmt=json`;

      const artistRes = await fetch(artistSearchUrl, {
        headers: { 'User-Agent': MB_UA },
      });

      if (!artistRes.ok) {
        logger.warn(`MusicBrainz artist search failed: HTTP ${artistRes.status}`);
        return res.status(502).json({ error: 'MusicBrainz artist search failed' });
      }

      const artistData = (await artistRes.json()) as MBArtistSearchResponse;
      const bestArtist = artistData.artists?.[0];

      if (!bestArtist) {
        return res.json({ artist: null, albums: [] });
      }

      // Rate limit: 1100ms delay between MusicBrainz requests
      await delay(1100);

      // Step 2: Fetch release groups for this artist
      const rgUrl =
        `${MB_BASE}/release-group` +
        `?artist=${encodeURIComponent(bestArtist.id)}` +
        `&type=album|single|ep` +
        `&fmt=json` +
        `&limit=100` +
        `&offset=0`;

      const rgRes = await fetch(rgUrl, {
        headers: { 'User-Agent': MB_UA },
      });

      if (!rgRes.ok) {
        logger.warn(`MusicBrainz release-group fetch failed: HTTP ${rgRes.status}`);
        return res.status(502).json({ error: 'MusicBrainz release-group fetch failed' });
      }

      const rgData = (await rgRes.json()) as MBReleaseGroupResponse;
      const releaseGroups = rgData['release-groups'] ?? [];

      // Build album list with Cover Art Archive URLs (non-awaited, may 404)
      const albums = releaseGroups.map((rg) => ({
        mbid: rg.id,
        title: rg.title,
        type: [rg['primary-type'], ...(rg['secondary-types'] ?? [])]
          .filter(Boolean)
          .join(' + '),
        firstReleaseDate: rg['first-release-date'] ?? null,
        artworkUrl: `${CAA_BASE}/${rg.id}/front-250`,
      }));

      const result = {
        artist: {
          mbid: bestArtist.id,
          name: bestArtist.name,
          country: bestArtist.country ?? null,
          disambiguation: bestArtist.disambiguation ?? null,
        },
        albums,
      };

      // Cache for 1 hour
      cacheSet(cacheKey, result, 3600);
      return res.json(result);
    } catch (err) {
      logger.error('artists/albums route error', { err });
      next(err);
    }
  },
);

// ─── GET /api/albums/:mbid ────────────────────────────────────────────────────

artistsRouter.get('/albums/:mbid', async (req, res, next) => {
  try {
    const { mbid } = req.params;

    if (!mbid || !/^[0-9a-f-]{36}$/i.test(mbid)) {
      return res.status(400).json({ error: 'Invalid MusicBrainz release group MBID' });
    }

    const cacheKey = `mb:album:tracklist:${mbid}`;
    const cached = cacheGet<object>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Fetch the release (first one) with recordings + artist credits for this release group
    const releaseUrl =
      `${MB_BASE}/release` +
      `?release-group=${encodeURIComponent(mbid)}` +
      `&inc=recordings+artist-credits` +
      `&fmt=json` +
      `&limit=1`;

    const releaseRes = await fetch(releaseUrl, {
      headers: { 'User-Agent': MB_UA },
    });

    if (!releaseRes.ok) {
      logger.warn(`MusicBrainz release fetch failed: HTTP ${releaseRes.status}`);
      return res.status(502).json({ error: 'MusicBrainz release fetch failed' });
    }

    const releaseData = (await releaseRes.json()) as MBReleaseResponse;
    const release = releaseData.releases?.[0];

    if (!release) {
      return res.status(404).json({ error: 'No release found for this release group' });
    }

    // Flatten tracks from all media (discs)
    const tracks: Array<{
      position: number;
      title: string;
      duration: number | null;
      mbid: string;
    }> = [];

    let globalPosition = 0;
    for (const medium of release.media ?? []) {
      for (const track of medium.tracks ?? []) {
        globalPosition += 1;
        tracks.push({
          position: track.position ?? globalPosition,
          title: track.title,
          duration: track.length != null ? Math.round(track.length / 1000) : null,
          mbid: track.recording?.id ?? track.id,
        });
      }
    }

    let artistName = release['artist-credit']?.[0]?.artist?.name;
    const year = release.date ? parseInt(release.date.slice(0, 4), 10) : null;

    // Fallback: if artist is still missing, fetch from the release-group directly
    if (!artistName) {
      try {
        await delay(1100);
        const rgRes = await fetch(
          `${MB_BASE}/release-group/${encodeURIComponent(mbid)}?inc=artist-credits&fmt=json`,
          { headers: { 'User-Agent': MB_UA } },
        );
        if (rgRes.ok) {
          const rgData = (await rgRes.json()) as { 'artist-credit'?: Array<{ artist: MBArtist }> };
          artistName = rgData['artist-credit']?.[0]?.artist?.name;
        }
      } catch { /* ignore fallback error */ }
    }

    // Artwork: try release-group level first (broader), then release level
    const artworkUrlRg = `${CAA_BASE}/${mbid}/front-500`;
    const artworkUrlRelease = `https://coverartarchive.org/release/${release.id}/front-500`;

    const result = {
      mbid,
      title: release.title,
      artist: artistName ?? 'Unknown Artist',
      year: Number.isNaN(year) ? null : year,
      tracks,
      artworkUrl: artworkUrlRg,
      artworkUrlRelease,
    };

    // Cache for 24 hours
    cacheSet(cacheKey, result, 24 * 3600);
    return res.json(result);
  } catch (err) {
    logger.error('albums/:mbid route error', { err });
    next(err);
  }
});

// ─── GET /api/artists/search-albums?q={q}&page={page}&limit={limit} ──────────
// Searches MusicBrainz release groups by title / artist name.

interface MBReleaseGroupSearchResponse {
  'release-groups': Array<{
    id: string;
    title: string;
    'primary-type'?: string;
    'secondary-types'?: string[];
    'first-release-date'?: string;
    'artist-credit'?: Array<{ artist: MBArtist; name?: string }>;
  }>;
  count: number;
  offset: number;
}

const searchAlbumsSchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

artistsRouter.get(
  '/search-albums',
  validate(searchAlbumsSchema, 'query'),
  async (req, res, next) => {
    try {
      const { q, limit, page } = req.query as unknown as z.infer<typeof searchAlbumsSchema>;
      const offset = (page - 1) * limit;
      const cacheKey = `mb:search:albums:${Buffer.from(q).toString('base64')}:${page}`;
      const cached = cacheGet<object>(cacheKey);
      if (cached) return res.json(cached);

      const url =
        `${MB_BASE}/release-group/` +
        `?query=${encodeURIComponent(q)}` +
        `&fmt=json&limit=${limit}&offset=${offset}`;

      const mbRes = await fetch(url, { headers: { 'User-Agent': MB_UA } });
      if (!mbRes.ok) {
        return res.status(502).json({ error: 'MusicBrainz album search failed' });
      }

      const data = (await mbRes.json()) as MBReleaseGroupSearchResponse;
      const albums = (data['release-groups'] ?? []).map((rg) => ({
        mbid: rg.id,
        title: rg.title,
        artist: rg['artist-credit']?.[0]?.artist?.name ?? 'Unknown Artist',
        type: [rg['primary-type'], ...(rg['secondary-types'] ?? [])].filter(Boolean).join(' + '),
        firstReleaseDate: rg['first-release-date'] ?? null,
        artworkUrl: `${CAA_BASE}/${rg.id}/front-250`,
      }));

      const result = { albums, total: data.count ?? albums.length, page, limit };
      cacheSet(cacheKey, result, 1800); // 30 min
      return res.json(result);
    } catch (err) {
      logger.error('artists/search-albums error', { err });
      next(err);
    }
  },
);

// ─── GET /api/artists/recordings?name={name}&page={page} ─────────────────────
// Returns all recordings by an artist from MusicBrainz (paginated, 100/page).
// Used by the artist page to show complete discography tracklist.

const recordingsQuerySchema = z.object({
  name: z.string().min(1).max(200),
  page: z.coerce.number().int().min(1).default(1),
});

artistsRouter.get(
  '/recordings',
  validate(recordingsQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { name, page } = req.query as unknown as z.infer<typeof recordingsQuerySchema>;
      const offset = (page - 1) * 100;
      const cacheKey = `mb:artist:recordings:${Buffer.from(name).toString('base64')}:${page}`;

      const cached = cacheGet<object>(cacheKey);
      if (cached) return res.json(cached);

      // Step 1: Find artist MBID
      const artistRes = await fetch(
        `${MB_BASE}/artist/?query=${encodeURIComponent(name)}&fmt=json`,
        { headers: { 'User-Agent': MB_UA } },
      );
      if (!artistRes.ok) {
        return res.status(502).json({ error: 'MusicBrainz artist search failed' });
      }
      const artistData = (await artistRes.json()) as MBArtistSearchResponse;
      const artist = artistData.artists?.[0];
      if (!artist) return res.json({ artist: null, recordings: [], total: 0 });

      await delay(1100);

      // Step 2: Get recordings for artist
      const recUrl =
        `${MB_BASE}/recording` +
        `?artist=${encodeURIComponent(artist.id)}` +
        `&fmt=json` +
        `&limit=100` +
        `&offset=${offset}` +
        `&inc=releases`;

      const recRes = await fetch(recUrl, { headers: { 'User-Agent': MB_UA } });
      if (!recRes.ok) {
        return res.status(502).json({ error: 'MusicBrainz recordings fetch failed' });
      }
      const recData = (await recRes.json()) as MBRecordingsResponse;

      const recordings = (recData.recordings ?? []).map((r) => {
        const firstRelease = r.releases?.[0];
        return {
          mbid: r.id,
          title: r.title,
          duration: r.length != null ? Math.round(r.length / 1000) : null,
          album: firstRelease?.title ?? null,
          albumMbid: firstRelease?.['release-group']?.id ?? null,
          year: firstRelease?.date?.slice(0, 4) ?? null,
        };
      });

      const result = {
        artist: { mbid: artist.id, name: artist.name },
        recordings,
        total: recData['recording-count'] ?? recordings.length,
        page,
      };

      cacheSet(cacheKey, result, 3600); // 1 hour
      return res.json(result);
    } catch (err) {
      logger.error('artists/recordings route error', { err });
      next(err);
    }
  },
);

// ─── GET /api/artists/provider-tracks?name={name} ────────────────────────────
// MusicBrainz-first approach: get all albums → get tracklists → match to YouTube.
// Returns tracks with canonical MusicBrainz metadata (title, album, artist) + YouTube provider info.

function normStr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\d]/gu, '')
    .trim();
}

function titleSimilar(a: string, b: string): boolean {
  const clean = (s: string) =>
    s
      .toLowerCase()
      // Remove feat/ft blocks in brackets
      .replace(/[\(\[\{]\s*(?:feat\.?|ft\.?|featuring)[^\)\]\}]*[\)\]\}]/gi, ' ')
      .replace(/\s*(?:feat\.?|ft\.?|featuring)\s+.*$/gi, ' ')
      // Remove common suffixes like "(Official Video)", "- Official", "Remastered"
      .replace(/[\(\[\{][^\)\]\}]{0,40}(?:official|video|audio|remaster|hd|hq|lyric|визуализ)[^\)\]\}]*[\)\]\}]/gi, ' ')
      .replace(/\s*[-–—]\s*(?:official|video|audio|remastered|hd|hq|lyric)\b.*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

  const na = normStr(clean(a));
  const nb = normStr(clean(b));
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [longer, shorter] = na.length >= nb.length ? [na, nb] : [nb, na];
  // prefix match: shorter must be at least 4 chars to avoid false positives
  if (longer.startsWith(shorter) && shorter.length >= 4) return true;
  // ratio guard: shorter must be at least 65% of longer
  if (shorter.length < longer.length * 0.65) return false;
  // substring in either direction
  if (longer.includes(shorter) || shorter.includes(longer)) return true;
  return false;
}

const NON_TRACK_RE =
  /(?:reaction|реакц|обзор|review|тизер|teaser|snippet|snipp?et|preview|превью|live\b|live\s+at|концерт|cover\s+by|кавер|karaoke|караоке|shorts|подкаст|интервью|interview|разбор|analysis|amv|behind\s+the\s+scenes|making\s+of|acoustic|акустик|instrumental|инструментал|freestyle|фристайл|remix\s+by|unofficial)/i;

const providerTracksSchema = z.object({
  name: z.string().min(1).max(200),
  albumMbid: z
    .string()
    .regex(/^[0-9a-f-]{36}$/i)
    .optional(),
});

artistsRouter.get(
  '/provider-tracks',
  validate(providerTracksSchema, 'query'),
  async (req, res, next) => {
    try {
      const { name, albumMbid } = req.query as z.infer<typeof providerTracksSchema>;
      const cacheKey = `artist:provider-tracks:v6:${Buffer.from(name).toString('base64')}:${albumMbid ?? 'all'}`;

      const cached = cacheGet<{ tracks: TrackMeta[] }>(cacheKey);
      if (cached) return res.json(cached);

      let artistName: string;
      let albumsToFetch: MBReleaseGroup[];

      if (albumMbid) {
        // Fast path: skip artist search + release groups list entirely.
        // Fetch the release group directly (includes artist name via artist-credits).
        const rgRes = await fetch(
          `${MB_BASE}/release-group/${encodeURIComponent(albumMbid)}?inc=artist-credits&fmt=json`,
          { headers: { 'User-Agent': MB_UA }, signal: AbortSignal.timeout(8000) },
        );
        if (!rgRes.ok) return res.json({ tracks: [] });
        const rgData = (await rgRes.json()) as {
          id: string;
          title: string;
          'primary-type'?: string;
          'secondary-types'?: string[];
          'first-release-date'?: string;
          'artist-credit'?: Array<{ name?: string; artist: { name: string } }>;
        };
        artistName = rgData['artist-credit']?.[0]?.artist?.name ?? name;
        albumsToFetch = [{
          id: rgData.id,
          title: rgData.title,
          'primary-type': rgData['primary-type'],
          'secondary-types': rgData['secondary-types'],
          'first-release-date': rgData['first-release-date'],
        }];
      } else {
        // Normal path: search artist + get release groups
        const artistRes = await fetch(
          `${MB_BASE}/artist/?query=${encodeURIComponent(name)}&fmt=json`,
          { headers: { 'User-Agent': MB_UA }, signal: AbortSignal.timeout(8000) },
        );
        if (!artistRes.ok) return res.json({ tracks: [] });
        const artistSearchData = (await artistRes.json()) as MBArtistSearchResponse;
        const artist = artistSearchData.artists?.[0];
        if (!artist) return res.json({ tracks: [] });
        artistName = artist.name;

        await delay(1100);
        const rgListRes = await fetch(
          `${MB_BASE}/release-group?artist=${encodeURIComponent(artist.id)}&type=album|single|ep&fmt=json&limit=50`,
          { headers: { 'User-Agent': MB_UA }, signal: AbortSignal.timeout(8000) },
        );
        if (!rgListRes.ok) return res.json({ tracks: [] });
        const rgListData = (await rgListRes.json()) as MBReleaseGroupResponse;
        albumsToFetch = (rgListData['release-groups'] ?? []).slice(0, 15);
      }

      if (albumsToFetch.length === 0) return res.json({ tracks: [] });

      interface MBAlbumTrack {
        title: string;
        duration: number | null; // seconds
        album: string;
        albumMbid: string;
        position: number;
      }

      // Parallel tracklist fetch: process 3 albums at a time
      const TRACKLIST_CONCURRENCY = 3;
      const mbTracks: MBAlbumTrack[] = [];
      const seenTitles = new Set<string>();

      for (let i = 0; i < albumsToFetch.length; i += TRACKLIST_CONCURRENCY) {
        const batch = albumsToFetch.slice(i, i + TRACKLIST_CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async (rg) => {
            const relRes = await fetch(
              `${MB_BASE}/release?release-group=${encodeURIComponent(rg.id)}&inc=recordings&fmt=json&limit=1`,
              { headers: { 'User-Agent': MB_UA }, signal: AbortSignal.timeout(8000) },
            );
            if (!relRes.ok) return [];
            const relData = (await relRes.json()) as MBReleaseResponse;
            const release = relData.releases?.[0];
            if (!release?.media) return [];
            const tracks: MBAlbumTrack[] = [];
            for (const medium of release.media) {
              for (const track of medium.tracks ?? []) {
                tracks.push({
                  title: track.title,
                  duration: track.length != null ? Math.round(track.length / 1000) : null,
                  album: rg.title,
                  albumMbid: rg.id,
                  position: track.position,
                });
              }
            }
            return tracks;
          }),
        );

        for (const result of batchResults) {
          if (result.status !== 'fulfilled') continue;
          for (const t of result.value) {
            const normTitle = normStr(t.title);
            if (!seenTitles.has(normTitle)) {
              seenTitles.add(normTitle);
              mbTracks.push(t);
            }
          }
        }

        // Delay between batches only (not after last batch, not for single-album albumMbid path)
        if (i + TRACKLIST_CONCURRENCY < albumsToFetch.length) {
          await delay(1200);
        }
      }

      if (mbTracks.length === 0) return res.json({ tracks: [] });

      // Step 4: Search YouTube for each album's tracks (batch per album)
      // Group tracks by album for efficient searching
      const albumGroups = new Map<string, MBAlbumTrack[]>();
      for (const t of mbTracks) {
        const arr = albumGroups.get(t.albumMbid) ?? [];
        arr.push(t);
        albumGroups.set(t.albumMbid, arr);
      }

      // Parallel YouTube searches: one per album + one for artist name
      const searchQueries: string[] = [
        artistName, // broad artist search
      ];
      for (const [, tracks] of albumGroups) {
        if (tracks.length > 0) {
          searchQueries.push(`${artistName} ${tracks[0].album}`);
        }
      }

      const ytResults = await Promise.allSettled(
        searchQueries.map((q) =>
          searchAll({ query: q, type: 'track', limit: 40 }),
        ),
      );

      // Collect all YouTube tracks
      const ytTracks: TrackMeta[] = [];
      const ytSeen = new Set<string>();
      for (const r of ytResults) {
        if (r.status !== 'fulfilled') continue;
        for (const t of r.value.tracks) {
          const key = `${t.provider}:${t.providerId}`;
          if (ytSeen.has(key)) continue;
          ytSeen.add(key);
          ytTracks.push(t);
        }
      }

      // Step 5: Match MB tracks → YouTube tracks
      const matchedTracks: TrackMeta[] = [];
      const usedYt = new Set<string>();
      const matchedMb = new Set<string>();

      const mbKey = (mbt: MBAlbumTrack) =>
        `${mbt.albumMbid}:${mbt.position}:${normStr(mbt.title)}`;

      const canMatch = (mbt: MBAlbumTrack, yt: TrackMeta): boolean => {
        const text = `${yt.title} ${yt.artist ?? ''}`;
        if (NON_TRACK_RE.test(text)) return false;
        if (!titleSimilar(mbt.title, yt.title)) return false;
        const ya = normStr(yt.artist ?? '');
        const aa = normStr(artistName);
        const sameArtist =
          !ya ||
          !aa ||
          ya.includes(aa) ||
          aa.includes(ya) ||
          titleSimilar(ya, aa);
        if (!sameArtist) return false;
        if (mbt.duration && yt.duration && Math.abs(mbt.duration - yt.duration) > 60) {
          return false;
        }
        const minDuration = albumMbid ? 8 : 15;
        if (yt.duration && (yt.duration > 1200 || yt.duration < minDuration)) return false;
        return true;
      };

      for (const mbt of mbTracks) {
        let bestMatch: TrackMeta | null = null;
        for (const yt of ytTracks) {
          const ytKey = `${yt.provider}:${yt.providerId}`;
          if (usedYt.has(ytKey)) continue;
          if (!canMatch(mbt, yt)) continue;
          bestMatch = yt;
          break;
        }

        if (!bestMatch) continue;

        usedYt.add(`${bestMatch.provider}:${bestMatch.providerId}`);
        matchedMb.add(mbKey(mbt));
        matchedTracks.push({
          id: bestMatch.id,
          provider: bestMatch.provider,
          providerId: bestMatch.providerId,
          title: mbt.title,
          artist: artistName,
          album: mbt.album,
          albumMbid: mbt.albumMbid,
          duration: mbt.duration ?? bestMatch.duration,
          artworkUrl: `${CAA_BASE}/${mbt.albumMbid}/front-250`, // official CAA artwork, not YouTube thumbnail
          year: undefined,
          score: bestMatch.score,
        });
      }

      if (albumMbid) {
        const unmatched = mbTracks.filter((mbt) => !matchedMb.has(mbKey(mbt)));
        if (unmatched.length > 0) {
          // Parallel fallback searches in batches of 4 to avoid YT rate limits
          const BATCH = 4;
          for (let i = 0; i < unmatched.length; i += BATCH) {
            const batch = unmatched.slice(i, i + BATCH);
            const batchResults = await Promise.allSettled(
              batch.map(async (mbt) => {
                let pool: TrackMeta[] = [];
                try {
                  const strict = await searchAll({
                    query: `${artistName} ${mbt.album} ${mbt.title}`,
                    type: 'track',
                    limit: 40,
                  });
                  pool = strict.tracks;
                } catch { /* ignore */ }

                let candidate = pool.find((yt) => {
                  const ytKey = `${yt.provider}:${yt.providerId}`;
                  if (usedYt.has(ytKey)) return false;
                  return canMatch(mbt, yt);
                });

                if (!candidate) {
                  try {
                    const broad = await searchAll({
                      query: `${artistName} ${mbt.title}`,
                      type: 'track',
                      limit: 40,
                    });
                    candidate = broad.tracks.find((yt) => {
                      const ytKey = `${yt.provider}:${yt.providerId}`;
                      if (usedYt.has(ytKey)) return false;
                      return canMatch(mbt, yt);
                    });
                  } catch { /* no-op */ }
                }

                return { mbt, candidate };
              }),
            );

            for (const r of batchResults) {
              if (r.status !== 'fulfilled' || !r.value.candidate) continue;
              const { mbt, candidate } = r.value;
              const ytKey = `${candidate.provider}:${candidate.providerId}`;
              if (usedYt.has(ytKey)) continue; // claimed by parallel sibling
              usedYt.add(ytKey);
              matchedMb.add(mbKey(mbt));
              matchedTracks.push({
                id: candidate.id,
                provider: candidate.provider,
                providerId: candidate.providerId,
                title: mbt.title,
                artist: artistName,
                album: mbt.album,
                albumMbid: mbt.albumMbid,
                duration: mbt.duration ?? candidate.duration,
                artworkUrl: `${CAA_BASE}/${mbt.albumMbid}/front-250`, // official CAA artwork
                year: undefined,
                score: candidate.score,
              });
            }
          }
        }
      }

      const result = { tracks: matchedTracks };
      cacheSet(cacheKey, result, 14400); // 4 hours
      return res.json(result);
    } catch (err) {
      logger.error('artists/provider-tracks route error', { err });
      next(err);
    }
  },
);

// ─── Artist image from Deezer → Last.fm fallback ─────────────────────────────
const artistImageSchema = z.object({ name: z.string().min(1).max(200) });

artistsRouter.get(
  '/image',
  validate(artistImageSchema, 'query'),
  async (req, res, next) => {
    try {
      const { name } = req.query as z.infer<typeof artistImageSchema>;
      const cacheKey = `artist:image:v2:${Buffer.from(name).toString('base64')}`;

      const cached = cacheGet<{ imageUrl: string | null }>(cacheKey);
      if (cached !== null) return res.json(cached);

      let imageUrl: string | null = null;

      // Primary: Deezer API — official artist photos, free, no key required
      try {
        const deezerRes = await fetch(
          `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`,
          { headers: { 'User-Agent': MB_UA }, signal: AbortSignal.timeout(5000) },
        );
        if (deezerRes.ok) {
          const deezerData = (await deezerRes.json()) as {
            data?: Array<{ name: string; picture_xl?: string; picture_big?: string; picture_medium?: string }>;
          };
          const artists = deezerData.data ?? [];
          // Find exact name match first, fallback to first result
          const normName = name.toLowerCase().replace(/\s+/g, ' ').trim();
          const match =
            artists.find((a) => a.name.toLowerCase().replace(/\s+/g, ' ').trim() === normName) ??
            artists[0];
          if (match) {
            // picture_xl is highest quality (1000x1000), picture_big is 500x500
            const pic = match.picture_xl ?? match.picture_big ?? match.picture_medium ?? null;
            // Deezer returns placeholder for artists without photos — skip those
            // Placeholder URL contains "/images/artist//" (empty hash) or ends with "-000000-80-0-0"
            if (pic && !pic.includes('//images/artist//') && !pic.endsWith('default_avatar.png')) {
              imageUrl = pic;
            }
          }
        }
      } catch { /* ignore */ }

      // Fallback: Last.fm API (no key needed for image endpoint)
      if (!imageUrl) {
        try {
          const lfmRes = await fetch(
            `https://www.last.fm/music/${encodeURIComponent(name)}/+images`,
            { headers: { 'User-Agent': MB_UA }, signal: AbortSignal.timeout(5000) },
          );
          if (lfmRes.ok) {
            const html = await lfmRes.text();
            // Extract first image URL from Last.fm gallery
            const imgMatch = html.match(/class="image-list-item-wrapper"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
            if (imgMatch?.[1]) {
              imageUrl = imgMatch[1].replace('/avatar170s/', '/avatar300s/');
            }
          }
        } catch { /* ignore */ }
      }

      const result = { imageUrl };
      cacheSet(cacheKey, result, 86400); // 24h
      return res.json(result);
    } catch (err) {
      logger.error('artists/image route error', { err });
      next(err);
    }
  },
);

// ─── GET /api/artists/mb-tracks?name=&albumMbid= ─────────────────────────────
// Fast endpoint: returns MusicBrainz tracklist WITHOUT any YouTube search.
// Tracks have provider: 'musicbrainz', providerId: recordingMbid.

artistsRouter.get(
  '/mb-tracks',
  validate(providerTracksSchema, 'query'),
  async (req, res, next) => {
    try {
      const { name, albumMbid } = req.query as z.infer<typeof providerTracksSchema>;
      const cacheKey = `artist:mb-tracks:v1:${Buffer.from(name).toString('base64')}:${albumMbid ?? 'all'}`;

      const cached = cacheGet<object>(cacheKey);
      if (cached) return res.json(cached);

      let artistName: string;
      let albumsToFetch: MBReleaseGroup[];

      if (albumMbid) {
        // Fast path: fetch the release group directly
        const rgRes = await fetch(
          `${MB_BASE}/release-group/${encodeURIComponent(albumMbid)}?inc=artist-credits&fmt=json`,
          { headers: { 'User-Agent': MB_UA }, signal: AbortSignal.timeout(8000) },
        );
        if (!rgRes.ok) return res.json({ tracks: [] });
        const rgData = (await rgRes.json()) as {
          id: string;
          title: string;
          'primary-type'?: string;
          'secondary-types'?: string[];
          'first-release-date'?: string;
          'artist-credit'?: Array<{ name?: string; artist: { name: string } }>;
        };
        artistName = rgData['artist-credit']?.[0]?.artist?.name ?? name;
        albumsToFetch = [{
          id: rgData.id,
          title: rgData.title,
          'primary-type': rgData['primary-type'],
          'secondary-types': rgData['secondary-types'],
          'first-release-date': rgData['first-release-date'],
        }];
      } else {
        // Normal path: search artist + get release groups
        const artistRes = await fetch(
          `${MB_BASE}/artist/?query=${encodeURIComponent(name)}&fmt=json`,
          { headers: { 'User-Agent': MB_UA }, signal: AbortSignal.timeout(8000) },
        );
        if (!artistRes.ok) return res.json({ tracks: [] });
        const artistSearchData = (await artistRes.json()) as MBArtistSearchResponse;
        const artist = artistSearchData.artists?.[0];
        if (!artist) return res.json({ tracks: [] });
        artistName = artist.name;

        await delay(1100);
        const rgListRes = await fetch(
          `${MB_BASE}/release-group?artist=${encodeURIComponent(artist.id)}&type=album|single|ep&fmt=json&limit=50`,
          { headers: { 'User-Agent': MB_UA }, signal: AbortSignal.timeout(8000) },
        );
        if (!rgListRes.ok) return res.json({ tracks: [] });
        const rgListData = (await rgListRes.json()) as MBReleaseGroupResponse;
        albumsToFetch = (rgListData['release-groups'] ?? []).slice(0, 15);
      }

      if (albumsToFetch.length === 0) return res.json({ tracks: [] });

      // Parallel tracklist fetch: process 3 albums at a time
      const TRACKLIST_CONCURRENCY = 3;
      const mbTracks: Array<{
        id: string;
        provider: string;
        providerId: string;
        title: string;
        artist: string;
        album: string;
        albumMbid: string;
        duration: number | null;
        artworkUrl: string;
      }> = [];
      const seenMbids = new Set<string>();

      for (let i = 0; i < albumsToFetch.length; i += TRACKLIST_CONCURRENCY) {
        const batch = albumsToFetch.slice(i, i + TRACKLIST_CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async (rg) => {
            const relRes = await fetch(
              `${MB_BASE}/release?release-group=${encodeURIComponent(rg.id)}&inc=recordings&fmt=json&limit=1`,
              { headers: { 'User-Agent': MB_UA }, signal: AbortSignal.timeout(8000) },
            );
            if (!relRes.ok) return [];
            const relData = (await relRes.json()) as MBReleaseResponse;
            const release = relData.releases?.[0];
            if (!release?.media) return [];

            const tracks: typeof mbTracks = [];
            for (const medium of release.media) {
              for (const track of medium.tracks ?? []) {
                const recordingMbid = track.recording?.id ?? track.id;
                tracks.push({
                  id: `musicbrainz:${recordingMbid}`,
                  provider: 'musicbrainz',
                  providerId: recordingMbid,
                  title: track.title,
                  artist: artistName,
                  album: rg.title,
                  albumMbid: rg.id,
                  duration: track.length != null ? Math.round(track.length / 1000) : null,
                  artworkUrl: `${CAA_BASE}/${rg.id}/front-250`,
                });
              }
            }
            return tracks;
          }),
        );

        for (const result of batchResults) {
          if (result.status !== 'fulfilled') continue;
          for (const t of result.value) {
            if (!seenMbids.has(t.providerId)) {
              seenMbids.add(t.providerId);
              mbTracks.push(t);
            }
          }
        }

        // Delay between batches only (not after last batch, not for single-album albumMbid path)
        if (!albumMbid && i + TRACKLIST_CONCURRENCY < albumsToFetch.length) {
          await delay(1200);
        }
      }

      const result = { tracks: mbTracks };
      cacheSet(cacheKey, result, 14400); // 4 hours
      return res.json(result);
    } catch (err) {
      logger.error('artists/mb-tracks route error', { err });
      next(err);
    }
  },
);

// ─── GET /api/artists/find-track?artist=&title=&album=&duration= ──────────────
// On-demand YouTube search for a SINGLE track. Called when user clicks play.

const findTrackSchema = z.object({
  artist: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  album: z.string().max(200).optional(),
  duration: z.coerce.number().int().min(1).max(3600).optional(),
});

artistsRouter.get(
  '/find-track',
  validate(findTrackSchema, 'query'),
  async (req, res, next) => {
    try {
      const { artist, title, album, duration } = req.query as unknown as z.infer<typeof findTrackSchema>;
      const cacheKey = `artist:find-track:v1:${Buffer.from(`${artist}:${title}`).toString('base64')}`;

      const cached = cacheGet<object | null>(cacheKey);
      if (cached !== null) return res.json(cached);

      // Try multiple search queries in order, stop at first match
      const queries = [
        `${artist} ${title}`,
        ...(album ? [`${artist} ${album} ${title}`] : []),
        `${artist} ${title} official`,
      ];

      for (const query of queries) {
        let results;
        try {
          results = await searchAll({ query, type: 'track', limit: 20 });
        } catch {
          continue;
        }

        const match = results.tracks.find((yt) => {
          const text = `${yt.title} ${yt.artist ?? ''}`;
          if (NON_TRACK_RE.test(text)) return false;
          if (!titleSimilar(title, yt.title)) return false;
          if (duration !== undefined && yt.duration !== undefined) {
            if (Math.abs(duration - yt.duration) > 60) return false;
          }
          if (yt.duration !== undefined && (yt.duration < 10 || yt.duration > 1200)) return false;
          return true;
        });

        if (match) {
          const result = {
            provider: match.provider,
            providerId: match.providerId,
            artworkUrl: match.artworkUrl,
          };
          cacheSet(cacheKey, result, 3600); // 1 hour
          return res.json(result);
        }
      }

      // Not found
      cacheSet(cacheKey, null, 3600);
      return res.json(null);
    } catch (err) {
      logger.error('artists/find-track route error', { err });
      return next(err);
    }
  },
);

// ─── POST /api/artists/warm-tracks ────────────────────────────────────────────
// Pre-warms stream URL cache for a list of tracks (fire-and-forget).
// Responds immediately; warming happens in the background.
artistsRouter.post('/warm-tracks', (req, res) => {
  const tracks = (req.body?.tracks ?? []) as Array<{ provider: string; providerId: string }>;
  // Respond immediately so the client isn't blocked
  res.json({ ok: true });
  // Warm in background: don't await
  for (const t of tracks.slice(0, 4)) {
    try {
      getProvider(t.provider).getStreamUrl(t.providerId).catch(() => {});
    } catch { /* ignore unknown provider */ }
  }
});
