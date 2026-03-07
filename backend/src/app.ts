import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { authRouter } from './api/auth.router';
import { searchRouter } from './api/search.router';
import { tracksRouter } from './api/tracks.router';
import { libraryRouter } from './api/library.router';
import { playlistsRouter } from './api/playlists.router';
import { streamRouter } from './api/stream.router';
import { artistsRouter, clearMemCache } from './api/artists.router';
import { importRouter } from './api/import.router';
import { redis } from './services/redis.client';
import { errorHandler, notFound } from './utils/errors';
import { logger } from './utils/logger';
import { openApiSpec } from './openapi';

export function createApp() {
  const app = express();

  // ─── Security ──────────────────────────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
      credentials: true,
    }),
  );

  // ─── General middleware ─────────────────────────────────────────────────────
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (process.env.NODE_ENV !== 'test') {
    app.use(
      morgan('combined', {
        stream: { write: (msg) => logger.http(msg.trim()) },
      }),
    );
  }

  // ─── Rate limiting (per-route, generous for normal browsing) ────────────────
  const rl = (max: number, windowMs = 15 * 60 * 1000) =>
    rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false });

  // Auth write — brute-force guard
  app.use('/api/auth/login',    rl(20));
  app.use('/api/auth/register', rl(10));
  app.use('/api/auth/refresh',  rl(60));

  // Search — calls external APIs, limit to prevent abuse
  app.use('/api/search', rl(120));

  // Stream — frequent (retries, range seeks)
  app.use('/api/stream', rl(600));

  // Everything else — library reads, playlists, track metadata
  app.use('/api', rl(1000));

  // ─── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

  // ─── Cache clear ─────────────────────────────────────────────────────────
  app.post('/api/admin/clear-cache', async (_req, res) => {
    clearMemCache();
    // Flush Redis keys with known prefixes
    try {
      const ioredis = await import('./services/redis.client').then(m => m.getIORedis());
      const keys = await ioredis.keys('yt:*');
      const keys2 = await ioredis.keys('artist:*');
      const allKeys = [...keys, ...keys2];
      if (allKeys.length > 0) await ioredis.del(...allKeys);
    } catch { /* Redis may not be available */ }
    res.json({ success: true, message: 'All caches cleared' });
  });

  // ─── API docs ──────────────────────────────────────────────────────────────
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

  // ─── Routers ───────────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/tracks', tracksRouter);
  app.use('/api/library', libraryRouter);
  app.use('/api/playlists', playlistsRouter);
  app.use('/api/stream', streamRouter);
  app.use('/api/artists', artistsRouter);
  app.use('/api/import', importRouter);

  // ─── Error handling ────────────────────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
