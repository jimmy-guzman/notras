import { decodeHTML } from "entities";
import { Marked } from "marked";
import type { Token, Tokens } from "marked";

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
  includePreview?: boolean;
  limit?: number;
  pinnedOnly?: boolean;
  query?: string;
  tag?: string;
}

const TRAILING_SURROGATE = /\p{Surrogate}$/u;

const NOTE_NAME_MAX_LENGTH = 120;

const MARKDOWN_EXTENSION = /\.(?:md|markdown)$/iu;

export function noteTitle(path: string) {
  const name = path.replaceAll("\\", "/").split("/").at(-1) ?? path;
  const stem = name.replace(MARKDOWN_EXTENSION, "");

  // A draft has no path yet; Rust names a note with no title the same way.
  return stem === "" ? "untitled" : stem;
}

/**
 * CommonMark's ATX level-1 shape: up to three spaces of indent, one `#`, then a
 * space, a tab, or end of line. `##` never matches, and a tab indent makes the
 * line a code block rather than a heading.
 */
export const ATX_HEADING = /^ {0,3}#(?:[ \t]|$)/u;

/**
 * A filesystem-safe filename for `title`, without its extension.
 *
 * Illegal and control characters join whitespace as separators, so any run of
 * them collapses to one hyphen. The result always satisfies
 * the native filename validation: no separators, no leading dot, never blank.
 */
const LEADING_DOTS_OR_HYPHENS = /^[.-]+/u;

const TRAILING_DOTS_OR_HYPHENS = /[.-]+$/u;

export function filenameFromTitle(title: string) {
  const slug = title
    .toLowerCase()
    .replaceAll(/[\s"*/:<>?\\|\p{Cc}]+/gu, "-")
    .replaceAll(/-{2,}/gu, "-")
    .slice(0, NOTE_NAME_MAX_LENGTH)
    .replace(TRAILING_SURROGATE, "")
    .replace(LEADING_DOTS_OR_HYPHENS, "")
    .replace(TRAILING_DOTS_OR_HYPHENS, "");

  return slug === "" ? "untitled" : slug;
}

const WIKILINK_TITLE = String.raw`[^\n[\]]+`;
const WHOLE_WIKILINK_TITLE = new RegExp(`^${WIKILINK_TITLE}$`, "u");

/** `[[title]]` at the start of the text, its title in the `title` group. */
export const WIKILINK_TOKEN = new RegExp(
  String.raw`^\[\[(?<title>${WIKILINK_TITLE})\]\]`,
  "u"
);

/** `![[title]]` at the start of the text, its title in the `title` group. */
export const EMBED_TOKEN = new RegExp(
  String.raw`^!\[\[(?<title>${WIKILINK_TITLE})\]\]`,
  "u"
);

/** Whether `title` reads back as a wikilink's or an embed's title once saved. */
export function isWikilinkTitle(title: string) {
  return WHOLE_WIKILINK_TITLE.test(title);
}

const TITLE_SPACE = /\s+/gu;
const FRONTMATTER_TITLE = /^title\s*:/u;

const titleMarkdown = new Marked({
  extensions: [
    {
      level: "inline",
      name: "codespan",
      start: (source) => source.indexOf("[["),
      tokenizer: (source) => {
        const match = WIKILINK_TOKEN.exec(source);

        return match === null
          ? undefined
          : { raw: match[0], text: match.groups?.title, type: "codespan" };
      },
    },
    {
      level: "inline",
      name: "image",
      start: (source) => source.indexOf("![["),
      tokenizer: (source) => {
        const match = EMBED_TOKEN.exec(source);

        return match === null ? undefined : { raw: match[0], type: "image" };
      },
    },
  ],
  gfm: true,
});

function lineBreaks(text: string) {
  return text.split("\n").length - 1;
}

function isList(token: Token): token is Tokens.List {
  return token.type === "list";
}

function hasText(token: Token): token is Token & { text: string } {
  return "text" in token && typeof token.text === "string";
}

function inlineTitle(tokens: Token[]): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case "image":
        case "html": {
          return "\n".repeat(lineBreaks(token.raw));
        }

        case "br": {
          return "\n";
        }

        case "codespan": {
          return hasText(token) ? token.text : "";
        }

        default: {
          if ("tokens" in token && token.tokens !== undefined) {
            return inlineTitle(token.tokens);
          }

          return hasText(token) ? decodeHTML(token.text) : "";
        }
      }
    })
    .join("");
}

interface TitleAt {
  line: number;
  title: string;
}

function tokenTitle(tokens: Token[], firstLine: number): TitleAt | undefined {
  let line = firstLine;
  let found: TitleAt | undefined;

  for (const token of tokens) {
    if (isList(token)) {
      found = tokenTitle(token.items, line);
    } else if (token.type === "blockquote" || token.type === "list_item") {
      found = tokenTitle(token.tokens ?? [], line);
    } else if (
      token.type === "heading" ||
      token.type === "paragraph" ||
      token.type === "text"
    ) {
      const lines = inlineTitle(token.tokens ?? []).split("\n");
      const first = [...lines.entries()].find(([, text]) => text.trim() !== "");
      found =
        first === undefined
          ? undefined
          : {
              line: line + first[0],
              title: first[1].trim().replaceAll(TITLE_SPACE, " "),
            };
    }

    if (found !== undefined) {
      break;
    }

    line += lineBreaks(token.raw);
  }

  return found;
}

/** Enough for a title and the block after it in nearly every note. */
const TITLE_WINDOW = 2048;

/** A `[label]: destination` anywhere in the note resolves a `[label]` above it. */
const LINK_DEFINITION = /\[[^\]\n]*\]:/u;

/**
 * A line that ends a paragraph above it whatever follows: a blank line, or an
 * ATX heading, a fence or a non-empty list item at most three spaces in: some
 * of the starts CommonMark lets interrupt a paragraph. A quote, a rule or an
 * HTML start also interrupts one, and leaving them out only widens the window.
 * `breaks_paragraph` in `crates/notras-core/src/markdown.rs` is the same test.
 */
const PARAGRAPH_BREAK =
  /^(?:[ \t]*\r?$| {0,3}(?:#{1,6}(?:[ \t]|\r?$)|`{3,}[^`]*$|~~~|(?:[-+*]|1[.)])[ \t]+[^ \t\r]))/u;

/**
 * The title in the first `end` characters, or undefined until a whole line
 * after it there ends its paragraph, so no later line can close a link or code
 * span the title line opens, or turn it into a table header or a setext
 * heading.
 */
function windowTitle(body: string, end: number) {
  const window = body.slice(0, end);
  const found = tokenTitle(titleMarkdown.lexer(window), 0);
  const whole = window.split("\n").slice(0, -1);

  return found !== undefined &&
    whole.slice(found.line + 1).some((text) => PARAGRAPH_BREAK.test(text))
    ? found
    : undefined;
}

/**
 * The first readable source line, excluding code, images, embeds, HTML and
 * tables.
 *
 * Lexing a 450 KB note takes 20ms and this runs on every keystroke, so the
 * lexer reads a window that doubles until it holds the answer.
 */
export function bodyTitle(body: string) {
  for (let end = TITLE_WINDOW; end < body.length; end *= 2) {
    const found = windowTitle(body, end);

    // An unresolved reference keeps its brackets, and a definition further
    // down would resolve it.
    if (
      found !== undefined &&
      !(found.title.includes("[") && LINK_DEFINITION.test(body))
    ) {
      return found;
    }
  }

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
  const from = lines.slice(0, line).join("\n").length + (line === 0 ? 0 : 1);

  return title === undefined || titleLine === undefined
    ? undefined
    : { from, title, to: from + titleLine.length };
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
