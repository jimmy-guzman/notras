export interface NoteMeta {
  createdAt: Date;
  folder: string;
  path: string;
  pinned: boolean;
  snippet: null | string;
  tags: string[];
  title: string;
  updatedAt: Date;
}

export interface NoteFilters {
  folder?: string;
  limit?: number;
  pinnedOnly?: boolean;
  query?: string;
  /** Default ordering is pinned-first; "updated" is strict recency. */
  sort?: "updated";
  tag?: string;
}

/** Valid path segment: no separators or colons, not hidden, not blank. */
export const NOTE_SEGMENT_PATTERN = /^(?!\.)[^/\\:]+$/;

export function noteTitle(path: string) {
  const name = path.split("/").at(-1) ?? path;

  return name.replace(/\.(?:md|markdown)$/i, "");
}

/**
 * CommonMark's ATX level-1 shape: up to three spaces of indent, one `#`, then a
 * space, a tab, or end of line. `##` never matches, and a tab indent makes the
 * line a code block rather than a heading.
 */
const ATX_HEADING = /^ {0,3}#(?:[ \t]|$)/;

/**
 * Index of the body's first non-blank line, or -1.
 *
 * Only that line can carry the title, which is what lets the two functions
 * below skip fenced code blocks without tracking them: a fence opener cannot
 * match `ATX_HEADING`.
 */
function firstContentLine(lines: string[]) {
  return lines.findIndex((line) => {
    return line.trim() !== "";
  });
}

/**
 * The body's leading `# ` heading, when it has one. Kept in parity with
 * `leading_heading` in `src-tauri/src/index.rs`.
 */
function leadingHeading(body: string) {
  const lines = body.split("\n");
  const index = firstContentLine(lines);
  const line = index === -1 ? undefined : lines[index]?.replace(/\r$/, "");

  if (line === undefined || !ATX_HEADING.test(line)) {
    return undefined;
  }

  // Closed ATX form: `# title #`. The closing run has to be preceded by
  // whitespace, so `# C#` keeps its trailing character.
  const text = line
    .replace(/^ {0,3}#/, "")
    .trim()
    .replace(/\s+#+$/, "")
    .trim();

  return text === "" ? undefined : text;
}

/**
 * Rewrite the body's leading `# ` heading to `title`, or return `body`
 * byte-identical when there is none.
 *
 * The rule is deliberately narrow: an existing heading is rewritten, one is
 * never invented. A note opening with prose, a list, a quote, or a deeper
 * heading is left alone, so deleting the heading opts a note out of retitling
 * for good. Indentation and a CRLF ending are preserved.
 */
export function retitleLeadingHeading(body: string, title: string) {
  const lines = body.split("\n");
  const index = firstContentLine(lines);
  const raw = index === -1 ? undefined : lines[index];

  // A title carrying a line break would split the heading in two.
  if (raw === undefined || title === "" || /[\n\r]/.test(title)) {
    return body;
  }

  const ending = raw.endsWith("\r") ? "\r" : "";
  const line = raw.slice(0, raw.length - ending.length);

  if (!ATX_HEADING.test(line)) {
    return body;
  }

  const next = `${line.slice(0, line.indexOf("#"))}# ${title}${ending}`;

  return next === raw ? body : lines.with(index, next).join("\n");
}

/**
 * A filesystem-safe filename for `title`, without its extension.
 *
 * Illegal and control characters join whitespace as separators, so any run of
 * them collapses to one hyphen. The result always satisfies
 * `NOTE_SEGMENT_PATTERN`: no separators, no leading dot, never blank.
 */
export function filenameFromTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replaceAll(/[\s"*/:<>?\\|\p{Cc}]+/gu, "-")
    .replaceAll(/-{2,}/g, "-")
    .slice(0, 120)
    .replace(/^[.-]+/, "")
    .replace(/[.-]+$/, "");

  return slug === "" ? "untitled" : slug;
}

/**
 * A note's display title: frontmatter `title:`, then the leading `# ` heading,
 * then the filename stem. Kept in parity with `resolve_title` in
 * `src-tauri/src/index.rs`.
 */
export function resolveTitle(
  path: string,
  body: string,
  frontmatterTitle?: string,
) {
  return frontmatterTitle ?? leadingHeading(body) ?? noteTitle(path);
}

export function noteFolder(path: string) {
  const index = path.lastIndexOf("/");

  return index === -1 ? "" : path.slice(0, index);
}

export function notePath(folder: string, filename: string) {
  return folder === "" ? `${filename}.md` : `${folder}/${filename}.md`;
}
