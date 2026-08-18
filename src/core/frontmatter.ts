/**
 * Tolerant parser/serializer for the tiny frontmatter dialect notras cares
 * about. Only `pinned`, `tags` and `title` are interpreted; unknown keys are
 * preserved verbatim when rewriting, so externally-authored notes survive
 * round-trips. Kept in parity with the Rust parser in
 * `src-tauri/src/frontmatter.rs`.
 */

interface Frontmatter {
  pinned: boolean;
  tags: string[];
  /**
   * Read-only. notras resolves a title from this key but never authors it, so
   * it stays a foreign line and round-trips through `updateFrontmatter`.
   */
  title: string | undefined;
}

/** The keys `updateFrontmatter` writes. `title` is deliberately absent. */
interface FrontmatterPatch {
  pinned?: boolean;
  tags?: string[];
}

export interface ParsedNote {
  body: string;
  frontmatter: Frontmatter;
  /** Raw lines of the frontmatter block, without the `---` delimiters. */
  rawLines: string[];
}

const CLOSING_DELIMITERS = new Set(["---", "..."]);

const TRAILING_CR = /\r$/;

function cleanTag(raw: string) {
  const tag = raw
    .trim()
    .replaceAll(/^["']+|["']+$/g, "")
    // Separators are dropped, never kept: a tag carrying one would serialize
    // into `tags: [a, b]` and re-parse as two tags.
    .replaceAll(/[,[\]]/g, "")
    .trim()
    .toLowerCase();

  return tag.length > 0 ? tag : undefined;
}

/**
 * A `title:` value with its quoting undone. An empty value counts as absent so
 * title resolution falls through to the next source.
 *
 * A single-quoted scalar has one escape, `''` for a literal quote, which is what
 * `serializeTitle` writes. A double-quoted one is only unwrapped: notras never
 * writes that form, and decoding YAML's backslash escapes would widen a dialect
 * `D6` keeps deliberately small. Kept in parity with `clean_title` in
 * `src-tauri/src/frontmatter.rs`.
 */
function unquoteTitle(value: string) {
  const quote = value.length > 1 ? value.at(0) : undefined;

  if ((quote !== "'" && quote !== '"') || !value.endsWith(quote)) {
    return value;
  }

  const inner = value.slice(1, -1);

  return quote === "'" ? inner.replaceAll("''", "'") : inner;
}

function cleanTitle(raw: string) {
  const title = unquoteTitle(raw.trim());

  return title.length > 0 ? title : undefined;
}

/**
 * A title as a frontmatter value, quoted whenever plain YAML would misread it.
 *
 * Single quotes are the safe form for prose: the only escape inside one is `''`,
 * so a title carrying a backslash or a double quote needs no further handling,
 * where the double-quoted form would treat `\` as an escape introducer.
 */
const BARE_YAML_TITLE = /^[\p{L}\p{N}][\p{L}\p{N} \-._]*$/u;

function serializeTitle(title: string) {
  return BARE_YAML_TITLE.test(title)
    ? title
    : `'${title.replaceAll("'", "''")}'`;
}

const LEADING_BRACKETS = /^\[+/;

const TRAILING_BRACKETS = /\]+$/;

function parseInlineTags(value: string) {
  return value
    .trim()
    .replace(LEADING_BRACKETS, "")
    .replace(TRAILING_BRACKETS, "")
    .split(",")
    .map(cleanTag)
    .filter((tag) => tag !== undefined);
}

/** True when the line was a `- tag` item, meaning the list continues. */
function readTagListItem(frontmatter: Frontmatter, line: string) {
  const item = line.trimStart();

  if (!item.startsWith("- ")) {
    return false;
  }

  const tag = cleanTag(item.slice(2));

  if (tag !== undefined) {
    frontmatter.tags.push(tag);
  }

  return true;
}

/** True when the line opened a block tag list, so the next lines are items. */
function readKeyLine(frontmatter: Frontmatter, line: string) {
  const separator = line.indexOf(":");

  if (separator === -1) {
    return false;
  }

  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim();

  switch (key) {
    case "pinned": {
      frontmatter.pinned = value.toLowerCase() === "true";

      return false;
    }
    case "tags": {
      if (value === "") {
        return true;
      }

      frontmatter.tags = parseInlineTags(value);

      return false;
    }
    case "title": {
      frontmatter.title = cleanTitle(value);

      return false;
    }
    default: {
      return false;
    }
  }
}

export function parseNote(content: string): ParsedNote {
  const fallback: ParsedNote = {
    body: content,
    frontmatter: { pinned: false, tags: [], title: undefined },
    rawLines: [],
  };

  if (!(content.startsWith("---\n") || content.startsWith("---\r\n"))) {
    return fallback;
  }

  const lines = content.split("\n");
  const closeIndex = lines.findIndex(
    (line, index) => index > 0 && CLOSING_DELIMITERS.has(line.trimEnd())
  );

  if (closeIndex === -1) {
    return fallback;
  }

  // CRLF files leave a trailing \r on every split line; strip it here so
  // `composeNote`'s \n joins cannot emit a block with mixed line endings.
  const rawLines = lines
    .slice(1, closeIndex)
    .map((line) => line.replace(TRAILING_CR, ""));
  const body = lines.slice(closeIndex + 1).join("\n");
  const frontmatter: Frontmatter = {
    pinned: false,
    tags: [],
    title: undefined,
  };

  let inTagsList = false;

  for (const line of rawLines) {
    const trimmed = line.trimEnd();

    if (inTagsList) {
      if (readTagListItem(frontmatter, trimmed)) {
        continue;
      }

      inTagsList = false;
    }

    inTagsList = readKeyLine(frontmatter, trimmed);
  }

  frontmatter.tags = [...new Set(frontmatter.tags)];

  return { body, frontmatter, rawLines };
}

/** Drops the `pinned`/`tags` lines (and tag list items) from a raw block. */
function withoutOwnKeys(rawLines: string[]) {
  let inTagsList = false;

  return rawLines.filter((line) => {
    const trimmed = line.trimEnd();

    if (inTagsList) {
      if (trimmed.trimStart().startsWith("- ")) {
        return false;
      }

      inTagsList = false;
    }

    const separator = trimmed.indexOf(":");

    if (separator === -1) {
      return true;
    }

    const key = trimmed.slice(0, separator).trim();

    if (key === "pinned") {
      return false;
    }

    if (key === "tags") {
      inTagsList = trimmed.slice(separator + 1).trim() === "";

      return false;
    }

    return true;
  });
}

/**
 * Rewrite an existing `title:` line in place, keeping its position in the block
 * and its indentation, or return `rawLines` unchanged when there is no such
 * key. notras updates a title key but never introduces one.
 *
 * The key is matched the way `parseNote` reads it, and the last match wins for
 * the same reason: a duplicated key is invalid YAML, and the two must agree
 * about which one is live. `serializeTitle` decides the quoting, so a title
 * carrying a colon, a quote, or a backslash stays valid YAML for the other tools
 * reading the file.
 */
export function retitleFrontmatter(rawLines: string[], title: string) {
  const index = rawLines.findLastIndex((line) => {
    const trimmed = line.trimEnd();
    const separator = trimmed.indexOf(":");

    return separator !== -1 && trimmed.slice(0, separator).trim() === "title";
  });

  if (index === -1) {
    return rawLines;
  }

  const existing = rawLines[index] ?? "";
  const indent = existing.slice(
    0,
    existing.length - existing.trimStart().length
  );

  return rawLines.with(index, `${indent}title: ${serializeTitle(title)}`);
}

/** Reassemble a full note file from raw frontmatter lines and a body. */
export function composeNote(rawLines: string[], body: string) {
  if (rawLines.length === 0) {
    return body;
  }

  return `---\n${rawLines.join("\n")}\n---\n${body}`;
}

/**
 * Rewrite a note's frontmatter with new `pinned`/`tags` values, preserving
 * every unknown key. Default values (`pinned: false`, no tags) are omitted;
 * a block that ends up empty is removed entirely.
 *
 * `title` is not writable and is not one of `withoutOwnKeys`'s own keys, so a
 * note carrying one keeps it verbatim through a pin or tag toggle.
 */
export function updateFrontmatter(
  content: string,
  patch: FrontmatterPatch
): string {
  const parsed = parseNote(content);
  const next = {
    pinned: patch.pinned ?? parsed.frontmatter.pinned,
    tags: patch.tags ?? parsed.frontmatter.tags,
  };

  const foreignLines = withoutOwnKeys(parsed.rawLines);

  const ownLines: string[] = [];

  if (next.pinned) {
    ownLines.push("pinned: true");
  }

  // Clean on the way out too, so a tag can never carry a separator into the
  // inline form and come back as two tags.
  const tags = [
    ...new Set(next.tags.map(cleanTag).filter((tag) => tag !== undefined)),
  ];

  if (tags.length > 0) {
    ownLines.push(`tags: [${tags.join(", ")}]`);
  }

  const blockLines = [...ownLines, ...foreignLines];

  if (blockLines.length === 0) {
    return parsed.body;
  }

  return `---\n${blockLines.join("\n")}\n---\n${parsed.body}`;
}
