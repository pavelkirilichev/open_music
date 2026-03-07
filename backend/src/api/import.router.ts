import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { importYandexMusic, importVkMusic, ImportedTrack, ImportedAlbum } from '../services/import.service';
import { searchAll } from '../services/providers/registry';
import { upsertTrack } from '../services/search.service';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import https from 'https';

export const importRouter = Router();
importRouter.use(requireAuth);

// POST /api/import/yandex — import liked tracks/albums from Yandex Music
importRouter.post('/yandex', async (req, res, next) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Требуется OAuth токен Яндекс Музыки' });
      return;
    }
    const result = await importYandexMusic(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/import/vk — import saved tracks from VK Music
importRouter.post('/vk', async (req, res, next) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Требуется VK access token' });
      return;
    }
    const result = await importVkMusic(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** HTTPS GET helper for MusicBrainz (avoid undici TLS issues) */
function mbFetch(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    https.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': 'OpenMusic/1.0 (open-music@example.com)', Accept: 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      },
    ).on('error', reject);
  });
}

// POST /api/import/save — match imported tracks to YouTube and save to library
importRouter.post('/save', async (req, res, next) => {
  try {
    const { tracks, albums } = req.body as { tracks?: ImportedTrack[]; albums?: ImportedAlbum[] };
    const userId = req.user!.sub;
    let savedTracks = 0;
    let savedAlbums = 0;
    const errors: string[] = [];

    // Save albums first: search MusicBrainz → save to library
    if (Array.isArray(albums)) {
      for (const a of albums) {
        try {
          const mbQuery = encodeURIComponent(`"${a.title}" AND artist:"${a.artist}"`);
          const mbData = await mbFetch(
            `https://musicbrainz.org/ws/2/release-group?query=${mbQuery}&limit=1&fmt=json`,
          );
          const rg = mbData?.['release-groups']?.[0];
          if (rg) {
            const albumRef = {
              mbid: rg.id,
              title: a.title,
              artist: a.artist,
              year: a.year || rg['first-release-date']?.slice(0, 4),
              coverUrl: a.coverUrl || null,
            };
            try {
              await prisma.libraryAlbum.create({
                data: { userId, albumRefJson: JSON.stringify(albumRef) },
              });
              savedAlbums++;
            } catch {
              savedAlbums++;
            }
          }
          // MusicBrainz rate limit: 1 req per 1.1s
          await new Promise((r) => setTimeout(r, 1100));
        } catch (err) {
          errors.push(`Не удалось найти альбом: ${a.artist} - ${a.title}`);
        }
      }
    }

    // Save tracks: search YouTube → take provider+providerId, use original YM/VK metadata
    if (Array.isArray(tracks)) {
      for (const t of tracks) {
        try {
          const query = `${t.artist} - ${t.title}`;
          const result = await searchAll({ query, provider: 'youtube', limit: 3, page: 1 });
          if (result.tracks.length > 0) {
            const match = result.tracks[0];
            const trackId = await upsertTrack({
              id: match.id,
              provider: match.provider,
              providerId: match.providerId,
              title: t.title,
              artist: t.artist,
              album: t.album,
              duration: t.duration || match.duration,
              artworkUrl: match.artworkUrl,
            });
            try {
              await prisma.libraryTrack.create({ data: { userId, trackId } });
              savedTracks++;
            } catch {
              savedTracks++;
            }
          }
          // Small delay to avoid yt-dlp/YouTube rate limits
          await new Promise((r) => setTimeout(r, 300));
        } catch (err) {
          errors.push(`Не удалось найти: ${t.artist} - ${t.title}`);
        }
      }
    }

    logger.info(`Import save: ${savedTracks} tracks, ${savedAlbums} albums for user ${userId}`);
    res.json({ savedTracks, savedAlbums, errors });
  } catch (err) {
    next(err);
  }
});
