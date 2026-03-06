import { BaseProvider, SearchOptions } from './base.provider';
import { TrackMeta, SearchResult } from '../../types';
import { redis } from '../redis.client';
import { logger } from '../../utils/logger';

const ARCHIVE_BASE = 'https://archive.org';

interface ArchiveDoc {
  identifier: string;
  title?: string;
  creator?: string;
  album?: string;
  year?: string | number;
  length?: number;
  subject?: string | string[];
  // File info from metadata API
  files?: Array<{
    name: string;
    format: string;
    length?: string;
    size?: string;
  }>;
}

export class ArchiveProvider extends BaseProvider {
  readonly name = 'archive';

  async search(opts: SearchOptions): Promise<SearchResult> {
    const { query, page = 1, limit = 20 } = opts;
    const cacheKey = `archive:search:${Buffer.from(query).toString('base64')}:${page}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SearchResult;

    try {
      const offset = (page - 1) * limit;
      const fields = 'identifier,title,creator,album,year,subject,length';
      const url =
        `${ARCHIVE_BASE}/advancedsearch.php?q=` +
        encodeURIComponent(`(${query}) AND mediatype:audio AND format:(mp3 OR ogg OR flac)`) +
        `&fl[]=${fields.split(',').join('&fl[]=')}&rows=${limit}&start=${offset}&output=json`;

      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Archive.org search failed: ${res.status}`);

      const data = (await res.json()) as {
        response: { numFound: number; docs: ArchiveDoc[] };
      };

      const tracks: TrackMeta[] = data.response.docs.map((doc) =>
        this.docToMeta(doc),
      );

      const result: SearchResult = {
        tracks,
        albums: [],
        total: data.response.numFound,
        page,
        limit,
      };
      await redis.setex(cacheKey, 3600, JSON.stringify(result));
      return result;
    } catch (err) {
      logger.error('Archive.org search failed', { err });
      return { tracks: [], albums: [], total: 0, page, limit };
    }
  }

  async getTrackMeta(providerId: string): Promise<TrackMeta> {
    const cacheKey = `archive:meta:${providerId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as TrackMeta;

    const url = `${ARCHIVE_BASE}/metadata/${providerId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Archive.org metadata failed: ${res.status}`);

    const data = (await res.json()) as {
      metadata: ArchiveDoc;
      files: ArchiveDoc['files'];
    };

    const doc: ArchiveDoc = { ...data.metadata, files: data.files, identifier: providerId };
    const meta = this.docToMeta(doc);
    await redis.setex(cacheKey, 86400, JSON.stringify(meta));
    return meta;
  }

  async getStreamUrl(providerId: string): Promise<string> {
    // Get the first playable audio file from the item
    const url = `${ARCHIVE_BASE}/metadata/${providerId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Archive.org metadata failed: ${res.status}`);

    const data = (await res.json()) as { files: Array<{ name: string; format: string }> };

    // Prefer mp3, then ogg, then any audio
    const audio = data.files.find(
      (f) =>
        f.format === 'VBR MP3' ||
        f.format === 'MP3' ||
        f.format === '128Kbps MP3' ||
        f.format === 'Ogg Vorbis',
    );

    if (!audio) throw new Error(`No audio file found for Archive:${providerId}`);
    return `${ARCHIVE_BASE}/download/${providerId}/${audio.name}`;
  }

  private docToMeta(doc: ArchiveDoc): TrackMeta {
    const subjects = Array.isArray(doc.subject)
      ? doc.subject
      : doc.subject
        ? [doc.subject]
        : [];

    return {
      id: `archive:${doc.identifier}`,
      provider: 'archive',
      providerId: doc.identifier,
      title: doc.title ?? doc.identifier,
      artist: doc.creator ?? 'Unknown',
      album: doc.album,
      duration: doc.length ? Number(doc.length) : undefined,
      artworkUrl: `${ARCHIVE_BASE}/services/img/${doc.identifier}`,
      year: doc.year ? Number(doc.year) : undefined,
      genre: subjects[0],
      score: 0.6,
    };
  }
}
