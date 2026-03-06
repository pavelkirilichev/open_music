import { logger } from '../utils/logger';

// ─── In-memory cache fallback ─────────────────────────────────────────────────
class MemoryCache {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return null; }
    return entry.value;
  }
  async set(key: string, value: string): Promise<string> {
    this.store.set(key, { value, expiresAt: Infinity });
    return 'OK';
  }
  async setex(key: string, seconds: number, value: string): Promise<string> {
    this.store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    return 'OK';
  }
  async del(key: string): Promise<number> { this.store.delete(key); return 1; }
  async ping(): Promise<string> { return 'PONG'; }
  async quit(): Promise<void> {}
}

let _ioredis: import('ioredis').Redis | null = null;
let _memory: MemoryCache | null = null;
let _initialized = false;

export let redisAvailable = false;

export async function initRedis(): Promise<void> {
  if (_initialized) return;
  _initialized = true;
  try {
    const { default: IORedis } = await import('ioredis');
    const r = new IORedis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 2000,
    });
    r.on('error', () => {}); // suppress unhandled
    await r.connect();
    await r.ping();
    _ioredis = r;
    redisAvailable = true;
    logger.info('Redis connected');
  } catch {
    _memory = new MemoryCache();
    redisAvailable = false;
    logger.warn('Redis unavailable — using in-memory cache');
  }
}

export function getIORedis(): import('ioredis').Redis {
  if (!_ioredis) throw new Error('Redis not available');
  return _ioredis;
}

async function ensureInit() {
  if (!_initialized) await initRedis();
}

export const redis = {
  async get(key: string): Promise<string | null> {
    await ensureInit();
    return _ioredis ? _ioredis.get(key) : _memory!.get(key);
  },
  async set(key: string, value: string): Promise<string | null> {
    await ensureInit();
    return _ioredis ? _ioredis.set(key, value) : _memory!.set(key, value);
  },
  async setex(key: string, seconds: number, value: string): Promise<string | null> {
    await ensureInit();
    return _ioredis ? _ioredis.setex(key, seconds, value) : _memory!.setex(key, seconds, value);
  },
  async del(key: string): Promise<number> {
    await ensureInit();
    return _ioredis ? _ioredis.del(key) : _memory!.del(key);
  },
  async ping(): Promise<string> {
    if (_ioredis) return _ioredis.ping();
    return 'PONG';
  },
  async quit(): Promise<void> {
    if (_ioredis) await _ioredis.quit();
  },
};
