import { Router } from 'express';
import { streamAudio } from '../services/stream.service';
import { optionalAuth } from '../middleware/auth.middleware';
import { AppError } from '../utils/errors';
import { addToHistory } from '../services/library.service';

export const streamRouter = Router();

const PROVIDERS = new Set(['youtube', 'archive', 'jamendo', 'soundcloud', 'zaycev', 'rutracker', 'vk']);

// GET /api/stream/:provider/:id
// Supports HTTP Range requests for seeking
streamRouter.get('/:provider/:id', optionalAuth, async (req, res, next) => {
  try {
    const { provider, id } = req.params;
    if (!PROVIDERS.has(provider)) {
      throw new AppError(400, `Unknown provider: ${provider}`, 'INVALID_PROVIDER');
    }

    const rangeHeader = req.headers.range;

    await streamAudio({
      provider,
      providerId: id,
      userId: req.user?.sub,
      rangeHeader,
      res,
    });

    // Record listen event (async, don't await)
    if (req.user?.sub) {
      addToHistory(req.user.sub, provider, id).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});
