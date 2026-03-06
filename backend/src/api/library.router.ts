import { Router } from 'express';
import { z } from 'zod';
import * as libraryService from '../services/library.service';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

export const libraryRouter = Router();
libraryRouter.use(requireAuth);

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

// GET /api/library/tracks
libraryRouter.get('/tracks', validate(pageSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit } = req.query as z.infer<typeof pageSchema>;
    const result = await libraryService.getLikedTracks(req.user!.sub, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/library/tracks/:provider/:id
libraryRouter.post('/tracks/:provider/:id', async (req, res, next) => {
  try {
    const { provider, id } = req.params;
    const result = await libraryService.likeTrack(req.user!.sub, provider, id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/library/tracks/:provider/:id
libraryRouter.delete('/tracks/:provider/:id', async (req, res, next) => {
  try {
    const { provider, id } = req.params;
    const result = await libraryService.unlikeTrack(req.user!.sub, provider, id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/library/tracks/:provider/:id/liked
libraryRouter.get('/tracks/:provider/:id/liked', async (req, res, next) => {
  try {
    const { provider, id } = req.params;
    const liked = await libraryService.isTrackLiked(req.user!.sub, provider, id);
    res.json({ liked });
  } catch (err) {
    next(err);
  }
});

// POST /api/library/tracks/liked-batch
// Body: { items: [{provider, providerId}] } — returns liked keys "provider:providerId"
libraryRouter.post('/tracks/liked-batch', async (req, res, next) => {
  try {
    const { items } = req.body as { items: Array<{ provider: string; providerId: string }> };
    if (!Array.isArray(items) || items.length === 0) return res.json({ liked: [] });
    const likedKeys = await libraryService.getLikedBatch(req.user!.sub, items.slice(0, 100));
    res.json({ liked: likedKeys });
  } catch (err) {
    next(err);
  }
});

// GET /api/library/albums
libraryRouter.get('/albums', async (req, res, next) => {
  try {
    const albums = await libraryService.getLibraryAlbums(req.user!.sub);
    res.json(albums);
  } catch (err) {
    next(err);
  }
});

// POST /api/library/albums
libraryRouter.post('/albums', async (req, res, next) => {
  try {
    const album = await libraryService.addAlbum(req.user!.sub, req.body);
    res.status(201).json(album);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/library/albums/:albumId
libraryRouter.delete('/albums/:albumId', async (req, res, next) => {
  try {
    const result = await libraryService.removeAlbum(req.user!.sub, req.params.albumId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/library/artists
libraryRouter.get('/artists', async (req, res, next) => {
  try {
    const artists = await libraryService.getLibraryArtists(req.user!.sub);
    res.json(artists);
  } catch (err) {
    next(err);
  }
});

// POST /api/library/artists
libraryRouter.post('/artists', async (req, res, next) => {
  try {
    const artist = await libraryService.addArtist(req.user!.sub, req.body);
    res.status(201).json(artist);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/library/artists/:artistId
libraryRouter.delete('/artists/:artistId', async (req, res, next) => {
  try {
    const result = await libraryService.removeArtist(req.user!.sub, req.params.artistId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/library/history
libraryRouter.get('/history', validate(pageSchema, 'query'), async (req, res, next) => {
  try {
    const { limit } = req.query as z.infer<typeof pageSchema>;
    const history = await libraryService.getHistory(req.user!.sub, limit);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

// POST /api/library/history (record a listen)
libraryRouter.post('/history', async (req, res, next) => {
  try {
    const { provider, providerId, durationMs } = req.body as {
      provider: string;
      providerId: string;
      durationMs?: number;
    };
    await libraryService.addToHistory(req.user!.sub, provider, providerId, durationMs);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
