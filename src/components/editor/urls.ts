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

function parseUrl(url: string) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * The scheme of a URL, or null when it carries none.
 *
 * The platform parser is the authority here: it strips the leading blanks and
 * embedded tabs/newlines a browser would strip, so `java&Tab;script:` cannot
 * sneak past as schemeless the way a hand-rolled regex lets it.
 */
function schemeOf(url: string) {
  const parsed = parseUrl(url);

  if (parsed === null) {
    return null;
  }

  const scheme = parsed.protocol.slice(0, -1).toLowerCase();

  // A dotted "scheme" is really a host with a port -- `example.com:8080/path`
  // parses as protocol `example.com:`, and still wants an https:// prefix.
  // No dangerous scheme contains a dot, so this cannot open a hole.
  return scheme.includes(".") ? null : scheme;
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
