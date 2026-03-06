import { IncomingMessage } from 'http';
import https from 'https';
import http from 'http';
import { Response } from 'express';
import { getProvider } from './providers/registry';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

export async function streamAudio(opts: {
  provider: string;
  providerId: string;
  userId?: string;
  rangeHeader?: string;
  res: Response;
}) {
  const { provider, providerId, userId, rangeHeader, res } = opts;

  // 1. Check for cached audio in MinIO (optional — skip if unavailable)
  try {
    const cached = await prisma.cachedAudio.findFirst({
      where: {
        track: { provider, providerId },
        status: 'ready',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (cached && (cached.userId == null || cached.userId === userId)) {
      logger.debug('Serving from MinIO cache', { storageKey: cached.storageKey });
      await streamFromMinIO(cached.storageKey, cached.mimeType, res);
      return;
    }
  } catch {
    // MinIO unavailable — fall through to live stream
  }

  // 2. Get stream URL from provider and proxy (or use streamDirect for torrent-based providers)
  try {
    const p = getProvider(provider);
    if (typeof p.streamDirect === 'function') {
      await p.streamDirect(providerId, rangeHeader, res);
    } else {
      const streamUrl = await p.getStreamUrl(providerId);
      await proxyStream(streamUrl, rangeHeader, res);
    }
  } catch (err) {
    logger.error('Stream failed', { provider, providerId, err });
    if (!res.headersSent) {
      res.status(502).json({
        error: { message: 'Audio stream unavailable', code: 'STREAM_UNAVAILABLE', details: String(err) },
      });
    }
  }
}

async function streamFromMinIO(storageKey: string, mimeType: string, res: Response) {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { s3Client, BUCKET } = await import('./s3.client');

  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: storageKey });
  const s3Res = await s3Client.send(cmd);

  res.setHeader('Content-Type', mimeType);
  if (s3Res.ContentLength) res.setHeader('Content-Length', s3Res.ContentLength);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Cache', 'HIT');
  (s3Res.Body as NodeJS.ReadableStream).pipe(res);
}

async function proxyStream(url: string, rangeHeader: string | undefined, res: Response, redirects = 0): Promise<void> {
  if (redirects > 5) throw new Error('Too many redirects');

  return new Promise<void>((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'audio/*,*/*;q=0.9',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': new URL(url).origin + '/',
    };
    if (rangeHeader) headers['Range'] = rangeHeader;

    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (upstream: IncomingMessage) => {
      const status = upstream.statusCode ?? 200;

      // Follow 3xx redirects (archive.org CDN uses them)
      if (status >= 300 && status < 400 && upstream.headers.location) {
        upstream.destroy();
        const location = upstream.headers.location;
        const nextUrl = location.startsWith('http') ? location : new URL(location, url).href;
        proxyStream(nextUrl, rangeHeader, res, redirects + 1).then(resolve).catch(reject);
        return;
      }

      res.status(status);

      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'transfer-encoding']) {
        const val = upstream.headers[h];
        if (val) res.setHeader(h, val);
      }

      // Ensure browser-compatible Content-Type for common audio formats
      const ct = res.getHeader('content-type') as string | undefined;
      if (!ct || ct.includes('octet-stream') || ct.includes('webm')) {
        // If content-type is missing/binary/webm, detect from URL
        if (url.includes('.m4a') || url.includes('mime=audio%2Fmp4') || url.includes('mime=audio/mp4')) {
          res.setHeader('Content-Type', 'audio/mp4');
        } else if (!ct || ct.includes('octet-stream')) {
          res.setHeader('Content-Type', 'audio/mpeg');
        }
      }
      res.setHeader('X-Cache', 'MISS');
      // Let browser cache audio chunks for smoother playback
      res.setHeader('Cache-Control', 'public, max-age=600');

      upstream.pipe(res);
      upstream.on('end', resolve);
      upstream.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('Stream timeout')); });
  });
}
