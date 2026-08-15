/** Prepend https:// to schemeless URLs; empty input yields null. */
export function normalizeUrl(raw: string) {
  const url = raw.trim();

  if (url === "") {
    return null;
  }

  return /^[a-z][\d+.a-z-]*:/i.test(url) ? url : `https://${url}`;
}
