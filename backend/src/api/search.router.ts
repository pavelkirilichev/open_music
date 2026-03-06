import { Router } from 'express';
import { z } from 'zod';
import { search } from '../services/search.service';
import { validate } from '../middleware/validate.middleware';
import { optionalAuth } from '../middleware/auth.middleware';

export const searchRouter = Router();

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  provider: z.enum(['all', 'youtube', 'archive', 'jamendo', 'soundcloud', 'zaycev', 'rutracker', 'vk']).optional().default('all'),
  type: z.enum(['track', 'album', 'artist']).optional().default('track'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

// GET /api/search?q=&provider=&type=&page=&limit=
searchRouter.get(
  '/',
  optionalAuth,
  validate(searchQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { q, provider, type, page, limit } = req.query as unknown as z.infer<
        typeof searchQuerySchema
      >;
      const result = await search({ query: q, provider, type, page, limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
