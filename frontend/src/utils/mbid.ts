const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidMbid(value?: string | null): value is string {
  if (!value) return false;
  return MBID_RE.test(value.trim());
}
