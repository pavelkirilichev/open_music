import { Track } from '../types';

type TrackArtworkInput = Pick<Track, 'provider' | 'providerId' | 'artworkUrl'>;

function normalizeSrc(value?: string | null): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function youtubeArtworkFallbacks(videoId?: string): string[] {
  if (!videoId) return [];
  return [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  ];
}

export function getTrackArtworkCandidates(
  track?: TrackArtworkInput | null,
  extraFallbacks?: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const list: string[] = [];

  const push = (raw?: string | null) => {
    const src = normalizeSrc(raw);
    if (!src || seen.has(src)) return;
    seen.add(src);
    list.push(src);
  };

  push(track?.artworkUrl);

  if (track?.provider === 'youtube' && track.providerId) {
    for (const src of youtubeArtworkFallbacks(track.providerId)) {
      push(src);
    }
  }

  for (const src of extraFallbacks ?? []) {
    push(src);
  }

  return list;
}

