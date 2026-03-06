import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.middleware';
import { logger } from '../utils/logger';
import { searchAll } from '../services/providers/registry';
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

    const result = {
      mbid,
      title: release.title,
      artist: artistName ?? 'Unknown Artist',
      year: Number.isNaN(year) ? null : year,
      tracks,
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
  const na = normStr(a);
  const nb = normStr(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

const providerTracksSchema = z.object({
  name: z.string().min(1).max(200),
});

artistsRouter.get(
  '/provider-tracks',
  validate(providerTracksSchema, 'query'),
  async (req, res, next) => {
    try {
      const { name } = req.query as z.infer<typeof providerTracksSchema>;
      const cacheKey = `artist:provider-tracks:v2:${Buffer.from(name).toString('base64')}`;

      const cached = cacheGet<{ tracks: TrackMeta[] }>(cacheKey);
      if (cached) return res.json(cached);

      // Step 1: Find artist on MusicBrainz
      const artistRes = await fetch(
        `${MB_BASE}/artist/?query=${encodeURIComponent(name)}&fmt=json`,
        { headers: { 'User-Agent': MB_UA } },
      );
      if (!artistRes.ok) {
        return res.json({ tracks: [] });
      }
      const artistData = (await artistRes.json()) as MBArtistSearchResponse;
      const artist = artistData.artists?.[0];
      if (!artist) return res.json({ tracks: [] });

      const artistName = artist.name;

      // Step 2: Get release groups (albums + singles + EPs)
      await delay(1100);
      const rgRes = await fetch(
        `${MB_BASE}/release-group?artist=${encodeURIComponent(artist.id)}&type=album|single|ep&fmt=json&limit=50`,
        { headers: { 'User-Agent': MB_UA } },
      );
      if (!rgRes.ok) return res.json({ tracks: [] });
      const rgData = (await rgRes.json()) as MBReleaseGroupResponse;
      const releaseGroups = rgData['release-groups'] ?? [];

      // Step 3: For each release group, get tracklist from MusicBrainz
      // Limit to 15 albums to keep response time reasonable (~17s for MB + parallel YT searches)
      const albumsToFetch = releaseGroups.slice(0, 15);
      interface MBAlbumTrack {
        title: string;
        duration: number | null; // seconds
        album: string;
        albumMbid: string;
        position: number;
      }
      const mbTracks: MBAlbumTrack[] = [];
      const seenTitles = new Set<string>();

      for (const rg of albumsToFetch) {
        await delay(1100);
        try {
          const relRes = await fetch(
            `${MB_BASE}/release?release-group=${encodeURIComponent(rg.id)}&inc=recordings&fmt=json&limit=1`,
            { headers: { 'User-Agent': MB_UA } },
          );
          if (!relRes.ok) continue;
          const relData = (await relRes.json()) as MBReleaseResponse;
          const release = relData.releases?.[0];
          if (!release?.media) continue;

          for (const medium of release.media) {
            for (const track of medium.tracks ?? []) {
              const normTitle = normStr(track.title);
              if (seenTitles.has(normTitle)) continue; // dedup across albums
              seenTitles.add(normTitle);
              mbTracks.push({
                title: track.title,
                duration: track.length != null ? Math.round(track.length / 1000) : null,
                album: rg.title,
                albumMbid: rg.id,
                position: track.position,
              });
            }
          }
        } catch (err) {
          logger.warn(`Failed to fetch tracklist for ${rg.id}`, { err });
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

      for (const mbt of mbTracks) {
        // Find best YouTube match by title similarity
        let bestMatch: TrackMeta | null = null;
        for (const yt of ytTracks) {
          const ytKey = `${yt.provider}:${yt.providerId}`;
          if (usedYt.has(ytKey)) continue;
          if (titleSimilar(mbt.title, yt.title)) {
            // Duration check: if both have duration, reject if difference > 30s
            if (mbt.duration && yt.duration) {
              if (Math.abs(mbt.duration - yt.duration) > 30) continue;
            }
            // Reject compilations / snippets
            if (yt.duration && (yt.duration > 600 || yt.duration < 30)) continue;
            bestMatch = yt;
            break;
          }
        }

        if (bestMatch) {
          usedYt.add(`${bestMatch.provider}:${bestMatch.providerId}`);
          // Use MusicBrainz metadata but YouTube provider info
          matchedTracks.push({
            id: bestMatch.id,
            provider: bestMatch.provider,
            providerId: bestMatch.providerId,
            title: mbt.title,           // canonical MusicBrainz title
            artist: artistName,          // canonical MusicBrainz artist
            album: mbt.album,
            duration: mbt.duration ?? bestMatch.duration,
            artworkUrl: bestMatch.artworkUrl,
            year: mbt.album ? undefined : undefined,
            score: bestMatch.score,
          });
        }
      }

      const result = { tracks: matchedTracks };
      cacheSet(cacheKey, result, 3600);
      return res.json(result);
    } catch (err) {
      logger.error('artists/provider-tracks route error', { err });
      next(err);
    }
  },
);
