import { createReadStream } from 'fs';
import { unlink, mkdtemp, readdir, rmdir } from 'fs/promises';
import { statSync } from 'fs';
import path from 'path';
import os from 'os';
import { prisma } from '../prisma/client';
import { getProvider } from '../services/providers/registry';
import { YoutubeProvider } from '../services/providers/youtube.provider';
import { logger } from '../utils/logger';
import { CacheAudioJobData } from './queue';

// MinIO upload — optional (skip gracefully if unavailable)
async function uploadToS3(localFile: string, storageKey: string, mimeType: string): Promise<void> {
  const { Upload } = await import('@aws-sdk/lib-storage');
  const { s3Client, BUCKET } = await import('../services/s3.client');
  const fileStream = createReadStream(localFile);
  const upload = new Upload({
    client: s3Client,
    params: { Bucket: BUCKET, Key: storageKey, Body: fileStream, ContentType: mimeType },
  });
  await upload.done();
}

export async function processCacheAudioJob(data: CacheAudioJobData) {
  const { cacheId, provider, providerId, storageKey } = data;

  await prisma.cachedAudio.update({ where: { id: cacheId }, data: { status: 'processing' } });

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'open-music-'));
  const outTemplate = path.join(tmpDir, `${providerId}.%(ext)s`);

  try {
    const streamUrl = await getProvider(provider).getStreamUrl(providerId);
    const localFile = await downloadAudio(provider, providerId, streamUrl, outTemplate, tmpDir);

    const ext = path.extname(localFile).slice(1);
    const mimeType = extToMime(ext);
    const finalKey = storageKey.replace('%(ext)s', ext);

    await uploadToS3(localFile, finalKey, mimeType);

    const stat = statSync(localFile);
    await prisma.cachedAudio.update({
      where: { id: cacheId },
      data: { status: 'ready', storageKey: finalKey, fileSize: stat.size, mimeType },
    });
    logger.info('Audio cached', { cacheId, finalKey });
  } catch (err) {
    logger.error('Cache job failed', { cacheId, err });
    await prisma.cachedAudio.update({
      where: { id: cacheId },
      data: { status: 'error', errorMsg: String(err) },
    });
    throw err;
  } finally {
    try {
      const files = await readdir(tmpDir);
      await Promise.all(files.map((f) => unlink(path.join(tmpDir, f))));
      await rmdir(tmpDir);
    } catch { /* best-effort */ }
  }
}

async function downloadAudio(
  provider: string,
  providerId: string,
  streamUrl: string,
  outTemplate: string,
  tmpDir: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let args: string[];

    if (provider === 'youtube') {
      args = [
        `https://www.youtube.com/watch?v=${providerId}`,
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '-o', outTemplate, '--quiet',
      ];
    } else {
      args = [streamUrl, '-o', outTemplate, '--quiet', '--no-playlist'];
    }

    const proc = YoutubeProvider.spawn(args);

    proc.on('close', async (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp exited with code ${code}`));
      const files = await readdir(tmpDir);
      const audioFile = files.find((f) =>
        ['.mp3', '.m4a', '.webm', '.ogg', '.opus', '.flac'].some((ext) => f.endsWith(ext)),
      );
      if (!audioFile) return reject(new Error('No audio file found after download'));
      resolve(path.join(tmpDir, audioFile));
    });

    proc.on('error', reject);
  });
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', webm: 'audio/webm',
    ogg: 'audio/ogg', opus: 'audio/opus', flac: 'audio/flac', wav: 'audio/wav',
  };
  return map[ext] ?? 'audio/mpeg';
}
