import { decodeHTML } from "entities";
import { Marked, type Token } from "marked";
import { parseNote } from "@/core/frontmatter";

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
  const name = path.replaceAll("\\", "/").split("/").at(-1) ?? path;

  return name.replace(MARKDOWN_EXTENSION, "");
}

/**
 * CommonMark's ATX level-1 shape: up to three spaces of indent, one `#`, then a
 * space, a tab, or end of line. `##` never matches, and a tab indent makes the
 * line a code block rather than a heading.
 */
export const ATX_HEADING = /^ {0,3}#(?:[ \t]|$)/;

const LINE_BREAK = /[\n\r]/;

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
  const index = lines.findIndex((candidate) => candidate.trim() !== "");
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

const WIKILINK_TITLE = /^\[\[([^\n[\]]+)\]\]/;
const TITLE_SPACE = /\s+/g;
const FRONTMATTER_TITLE = /^title\s*:/;

const titleMarkdown = new Marked({
  extensions: [
    {
      level: "inline",
      name: "codespan",
      start: (source) => source.indexOf("[["),
      tokenizer: (source) => {
        const match = WIKILINK_TITLE.exec(source);
        return match === null
          ? undefined
          : { raw: match[0], text: match[1], type: "codespan" };
      },
    },
  ],
  gfm: true,
});

function lineBreaks(text: string) {
  return text.split("\n").length - 1;
}

function inlineTitle(tokens: Token[]): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case "image":
        case "html":
          return "\n".repeat(lineBreaks(token.raw));
        case "br":
          return "\n";
        case "codespan":
          return token.text;
        default:
          if ("tokens" in token && token.tokens !== undefined) {
            return inlineTitle(token.tokens);
          }
          return "text" in token ? decodeHTML(token.text) : "";
      }
    })
    .join("");
}

function tokenTitle(
  tokens: Token[],
  firstLine: number
): { line: number; title: string } | undefined {
  let line = firstLine;
  for (const token of tokens) {
    if (token.type === "list") {
      const title = tokenTitle(token.items, line);
      if (title !== undefined) {
        return title;
      }
    } else if (token.type === "blockquote" || token.type === "list_item") {
      const title = tokenTitle(token.tokens ?? [], line);
      if (title !== undefined) {
        return title;
      }
    } else if (
      token.type === "heading" ||
      token.type === "paragraph" ||
      token.type === "text"
    ) {
      const lines = inlineTitle(token.tokens ?? []).split("\n");
      const first = [...lines.entries()].find(([, text]) => text.trim() !== "");
      if (first !== undefined) {
        return {
          line: line + first[0],
          title: first[1].trim().replaceAll(TITLE_SPACE, " "),
        };
      }
    }
    line += lineBreaks(token.raw);
  }
}

/** The first readable source line, excluding code, images, HTML and tables. */
export function bodyTitle(body: string) {
  return tokenTitle(titleMarkdown.lexer(body), 0);
}

/** The content supplying a title and its complete source-line range. */
export function titleSource(content: string) {
  const parsed = parseNote(content);
  const candidate = bodyTitle(parsed.body);
  const lines = content.split("\n");
  const prefix = content.slice(0, content.length - parsed.body.length);
  const line =
    candidate === undefined
      ? prefix.split("\n").findLastIndex((text) => FRONTMATTER_TITLE.test(text))
      : lineBreaks(prefix) + candidate.line;
  const title = candidate?.title ?? parsed.frontmatter.title;
  const titleLine = lines[line];
  if (title === undefined || titleLine === undefined) {
    return;
  }
  const from = lines.slice(0, line).join("\n").length + (line === 0 ? 0 : 1);
  return { from, title, to: from + titleLine.length };
}

/** Readable body title, imported title, then filename stem, matching Rust. */
export function resolveTitle(
  path: string,
  body: string,
  frontmatterTitle?: string
) {
  return bodyTitle(body)?.title ?? frontmatterTitle ?? noteTitle(path);
}

export function noteFolder(path: string) {
  const index = path.lastIndexOf("/");

  return index === -1 ? "" : path.slice(0, index);
}
