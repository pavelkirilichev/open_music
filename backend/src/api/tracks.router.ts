import { Router } from 'express';
import { z } from 'zod';
import { getTrackMeta } from '../services/search.service';
import { requestCache, getCacheStatus } from '../services/cache.service';
import { getGeniusTrack } from '../services/genius.service';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { AppError } from '../utils/errors';

export const tracksRouter = Router();

const PROVIDERS = new Set(['youtube', 'archive', 'jamendo']);

function validateProvider(p: string) {
  if (!PROVIDERS.has(p)) throw new AppError(400, `Unknown provider: ${p}`, 'INVALID_PROVIDER');
}

const geniusQuerySchema = z.object({
  artist: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
});

// GET /api/tracks/genius?artist=&title=
tracksRouter.get('/genius', optionalAuth, validate(geniusQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { artist, title } = req.query as z.infer<typeof geniusQuerySchema>;
    const payload = await getGeniusTrack(artist, title);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// GET /api/tracks/:provider/:id
tracksRouter.get('/:provider/:id', optionalAuth, async (req, res, next) => {
  try {
    const { provider, id } = req.params;
    validateProvider(provider);
    const meta = await getTrackMeta(provider, id);
    res.json(meta);
  } catch (err) {
    next(err);
  }
});

// POST /api/tracks/:provider/:id/cache
tracksRouter.post('/:provider/:id/cache', requireAuth, async (req, res, next) => {
  try {
    const { provider, id } = req.params;
    validateProvider(provider);
    const result = await requestCache(provider, id, req.user!.sub);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/tracks/:provider/:id/cache-status
tracksRouter.get('/:provider/:id/cache-status', requireAuth, async (req, res, next) => {
  try {
    const { provider, id } = req.params;
    validateProvider(provider);
    const status = await getCacheStatus(provider, id, req.user!.sub);
    res.json(status);
  } catch (err) {
    next(err);
  }
});
