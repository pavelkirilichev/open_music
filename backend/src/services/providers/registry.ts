import { BaseProvider } from './base.provider';
import { YoutubeProvider } from './youtube.provider';
import { ArchiveProvider } from './archive.provider';
import { JamendoProvider } from './jamendo.provider';
import { SoundCloudProvider } from './soundcloud.provider';
import { ZaycevProvider } from './zaycev.provider';
import { RutrackerProvider } from './rutracker.provider';
import { VkProvider } from './vk.provider';
import { SearchResult, TrackMeta } from '../../types';
import { SearchOptions } from './base.provider';
import { logger } from '../../utils/logger';

// All registered providers — used for getProvider() (stream, metadata)
const providers: Record<string, BaseProvider> = {
  youtube: new YoutubeProvider(),
  archive: new ArchiveProvider(),
  jamendo: new JamendoProvider(),
  soundcloud: new SoundCloudProvider(),
  zaycev: new ZaycevProvider(),
  rutracker: new RutrackerProvider(),
  vk: new VkProvider(),
};

// Active search providers — only YouTube for now; others hidden (not deleted)
const SEARCH_PROVIDERS = ['youtube'] as const;

export function getProvider(name: string): BaseProvider {
  const p = providers[name];
  if (!p) throw new Error(`Unknown provider: ${name}`);
  return p;
}

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*[\[(](?:official|audio|video|hd|hq|lyrics?|mv|remaster\w*|live|remix|ft\.?|feat\.?)[\])]?/gi, '')
    .replace(/[^\p{L}\d\s]/gu, '') // keep Unicode letters (Cyrillic etc.), digits, spaces
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchAll(
  opts: SearchOptions & { provider?: string },
): Promise<SearchResult> {
  const { provider, ...searchOpts } = opts;

  if (provider && provider !== 'all') {
    return getProvider(provider).search(searchOpts);
  }

  // Parallel search across active providers
  const results = await Promise.allSettled(
    SEARCH_PROVIDERS.map((name) => providers[name].search(searchOpts)),
  );

  const allTracks: TrackMeta[] = [];
  let total = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allTracks.push(...result.value.tracks);
      total += result.value.total;
    } else {
      logger.warn('Provider search failed', { reason: result.reason });
    }
  }

  // Deduplicate by provider:providerId
  const seen = new Set<string>();
  const deduped = allTracks.filter((t) => {
    const key = `${t.provider}:${t.providerId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Dedup by normalized title+artist to avoid showing same song from multiple providers
  const titleSeen = new Set<string>();
  const deduped2 = deduped.filter((t) => {
    const key = `${normalizeKey(t.title)}|${normalizeKey(t.artist)}`;
    if (titleSeen.has(key)) return false;
    titleSeen.add(key);
    return true;
  });

  // Sort by score descending
  deduped2.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return {
    tracks: deduped2,
    albums: [],
    total,
    page: opts.page ?? 1,
    limit: opts.limit ?? 20,
  };
}
