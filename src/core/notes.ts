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

const TRAILING_SURROGATE = /\p{Surrogate}$/u;

const NOTE_NAME_MAX_LENGTH = 120;

const MARKDOWN_EXTENSION = /\.(?:md|markdown)$/i;

export function noteTitle(path: string) {
  const name = path.split("/").at(-1) ?? path;

  return name.replace(MARKDOWN_EXTENSION, "");
}

/**
 * CommonMark's ATX level-1 shape: up to three spaces of indent, one `#`, then a
 * space, a tab, or end of line. `##` never matches, and a tab indent makes the
 * line a code block rather than a heading.
 */
const ATX_HEADING = /^ {0,3}#(?:[ \t]|$)/;

const ATX_OPENING_HASH = /^ {0,3}#/;

const ATX_CLOSING_RUN = /\s+#+$/;

const TRAILING_CR = /\r$/;

const LINE_BREAK = /[\n\r]/;

/**
 * Index of the body's first non-blank line, or -1.
 *
 * Only that line can carry the title, which is what lets the two functions
 * below skip fenced code blocks without tracking them: a fence opener cannot
 * match `ATX_HEADING`.
 */
function firstContentLine(lines: string[]) {
  return lines.findIndex((line) => line.trim() !== "");
}

/**
 * The body's leading `#` heading, when it has one. Kept in parity with
 * `leading_heading` in `src-tauri/src/index.rs`.
 */
export function leadingHeading(body: string) {
  const lines = body.split("\n");
  const index = firstContentLine(lines);
  const line =
    index === -1 ? undefined : lines[index]?.replace(TRAILING_CR, "");

  if (line === undefined || !ATX_HEADING.test(line)) {
    return;
  }

  // Closed ATX form: `# title #`. The closing run has to be preceded by
  // whitespace, so `# C#` keeps its trailing character.
  const text = line
    .replace(ATX_OPENING_HASH, "")
    .trim()
    .replace(ATX_CLOSING_RUN, "")
    .trim();

  return text === "" ? undefined : text;
}

/**
 * Rewrite the body's leading `#` heading to `title`, or return `body`
 * byte-identical when there is none.
 *
 * The rule is deliberately narrow: an existing heading is rewritten, one is
 * never invented by this helper. Prose, lists, quotes, and deeper headings
 * are left alone. Indentation and a CRLF ending are preserved.
 */
export function retitleLeadingHeading(body: string, title: string) {
  const lines = body.split("\n");
  const index = firstContentLine(lines);
  const raw = index === -1 ? undefined : lines[index];

  // A title carrying a line break would split the heading in two.
  if (raw === undefined || title === "" || LINE_BREAK.test(title)) {
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
 * the native filename validation: no separators, no leading dot, never blank.
 */
const LEADING_DOTS_OR_HYPHENS = /^[.-]+/;

const TRAILING_DOTS_OR_HYPHENS = /[.-]+$/;

export function filenameFromTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replaceAll(/[\s"*/:<>?\\|\p{Cc}]+/gu, "-")
    .replaceAll(/-{2,}/g, "-")
    .slice(0, NOTE_NAME_MAX_LENGTH)
    .replace(TRAILING_SURROGATE, "")
    .replace(LEADING_DOTS_OR_HYPHENS, "")
    .replace(TRAILING_DOTS_OR_HYPHENS, "");

  return slug === "" ? "untitled" : slug;
}

/**
 * A note's display title: the leading `#` heading, then imported frontmatter `title:`,
 * then the filename stem. Kept in parity with `resolve_title` in
 * `src-tauri/src/index.rs`.
 */
export function resolveTitle(
  path: string,
  body: string,
  frontmatterTitle?: string
) {
  return leadingHeading(body) ?? frontmatterTitle ?? noteTitle(path);
}

export function noteFolder(path: string) {
  const index = path.lastIndexOf("/");

  return index === -1 ? "" : path.slice(0, index);
}
