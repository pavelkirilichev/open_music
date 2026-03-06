const ARTIST_SEPARATOR_RE = /\s*(?:feat\.?|ft\.?|featuring|&|,|;|\/|\|)\s*/gi;
const COMMA_LIKE_RE = /[\u201A\u201B\uFF0C\uFE50\uFE10\u060C\u3001]/g;
const INLINE_COMMA_SPACE_RE = /\s*[\u002C\u060C\u3001\u201A\u201B\uFE10\uFE50\uFF0C]\s*/g;
const TITLE_FEAT_RE = /\s*[\(\[\{]\s*(?:feat\.?|ft\.?|featuring)\s+([^\)\]\}]+)\s*[\)\]\}]\s*/gi;
const OFFICIAL_ARTIST_BY_KEY: Record<string, string> = {
  redo: 'REDO',
  oxxxymiron: 'Oxxxymiron',
  mironfyodorov: 'Oxxxymiron',
  mironfedorov: 'Oxxxymiron',
  миронфёдоров: 'Oxxxymiron',
  миронфедоров: 'Oxxxymiron',
  ram: 'RAM',
  kommo: 'Kommo',
};

function normalizeArtistKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\d]/gu, '');
}

function normalizeInlineArtistSeparators(value: string): string {
  return value
    .replace(COMMA_LIKE_RE, ',')
    .replace(/[\u2022\u00B7]/g, ',')
    .replace(INLINE_COMMA_SPACE_RE, ', ')
    .replace(/,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeDisplayText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function canonicalizeArtistName(name: string): string {
  const cleaned = normalizeDisplayText(name);
  if (!cleaned) return '';
  const key = normalizeArtistKey(cleaned);
  if (!key) return '';
  return OFFICIAL_ARTIST_BY_KEY[key] ?? cleaned;
}

export function parseArtistNames(artistStr: string): string[] {
  const normalized = normalizeInlineArtistSeparators(artistStr)
    .replace(ARTIST_SEPARATOR_RE, ',')
    .replace(/,+/g, ',');

  const seen = new Set<string>();
  const names: string[] = [];

  for (const token of normalized.split(',')) {
    const name = canonicalizeArtistName(normalizeInlineArtistSeparators(token));
    if (!name) continue;
    const key = normalizeArtistKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names.length > 0
    ? names
    : [canonicalizeArtistName(normalizeInlineArtistSeparators(artistStr))].filter(Boolean);
}

export function formatArtistNames(artistStr: string): string {
  return parseArtistNames(artistStr).join(', ');
}

export function formatAlbumName(album?: string | null): string {
  if (!album) return '';
  return normalizeDisplayText(album);
}

export function sanitizeTrackTitle(title: string, artistStr: string): string {
  const original = title.trim();
  if (!original) return title;

  const artistKeys = new Set(
    parseArtistNames(artistStr)
      .map((name) => normalizeArtistKey(name))
      .filter(Boolean),
  );

  if (artistKeys.size === 0) return original;

  const cleaned = original
    .replace(TITLE_FEAT_RE, (full, featuredRaw: string) => {
      const featured = parseArtistNames(featuredRaw);
      if (!featured.length) return full;
      const isDuplicate = featured.every((name) => artistKeys.has(normalizeArtistKey(name)));
      return isDuplicate ? ' ' : full;
    })
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned || original;
}

export function withFeaturedInTitle(
  title: string,
  artistStr: string,
  primaryArtist?: string,
): string {
  const original = title.trim();
  if (!original) return title;

  const baseTitle = original.replace(TITLE_FEAT_RE, ' ').replace(/\s{2,}/g, ' ').trim();
  const base = baseTitle || original;

  const fromTitle = Array.from(original.matchAll(TITLE_FEAT_RE))
    .flatMap((m) => parseArtistNames(m[1] ?? ''));

  const artistNames = parseArtistNames(artistStr);
  const primaryKey = primaryArtist ? normalizeArtistKey(primaryArtist) : '';
  const fromArtists = artistNames.filter((name, idx) => {
    const key = normalizeArtistKey(name);
    if (!key) return false;
    if (primaryKey) return key !== primaryKey;
    return idx > 0;
  });

  const seen = new Set<string>();
  const featured: string[] = [];
  for (const name of [...fromArtists, ...fromTitle]) {
    const key = normalizeArtistKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    featured.push(name);
  }

  if (!featured.length) return sanitizeTrackTitle(base, artistStr);
  return `${base} (feat. ${featured.join(', ')})`;
}
