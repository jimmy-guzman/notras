/**
 * Schemes a note is allowed to hand to the system opener. Note files are
 * written by anyone -- other editors, git, AI agents -- so a link's href is
 * untrusted input, not something the app authored.
 */
const SAFE_SCHEMES = new Set([
  "file",
  "ftp",
  "http",
  "https",
  "mailto",
  "obsidian",
  "tel",
]);

/** The scheme of a URL, or null when it carries none. */
function schemeOf(url: string) {
  // No `.` in the class: `example.com:8080/path` is a host with a port, not a
  // scheme, and must still get the https:// prefix.
  const match = /^([a-z][\d+a-z-]*):/i.exec(url);

  return match?.[1]?.toLowerCase() ?? null;
}

/** True when a href may be handed to the browser / system opener. */
export function isSafeUrl(url: string) {
  const scheme = schemeOf(url);

  return scheme === null || SAFE_SCHEMES.has(scheme);
}

/** Prepend https:// to schemeless URLs; empty or unsafe input yields null. */
export function normalizeUrl(raw: string) {
  const url = raw.trim();

  if (url === "" || !isSafeUrl(url)) {
    return null;
  }

  return schemeOf(url) === null ? `https://${url}` : url;
}
