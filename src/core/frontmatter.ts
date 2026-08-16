/**
 * Tolerant parser/serializer for the tiny frontmatter dialect notras cares
 * about. Only `pinned` and `tags` are interpreted; unknown keys are preserved
 * verbatim when rewriting, so externally-authored notes survive round-trips.
 * Kept in parity with the Rust parser in `src-tauri/src/frontmatter.rs`.
 */

export interface Frontmatter {
  pinned: boolean;
  tags: string[];
}

export interface ParsedNote {
  body: string;
  frontmatter: Frontmatter;
  /** Raw lines of the frontmatter block, without the `---` delimiters. */
  rawLines: string[];
}

const CLOSING_DELIMITERS = new Set(["---", "..."]);

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

function parseInlineTags(value: string) {
  return value
    .trim()
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .split(",")
    .map(cleanTag)
    .filter((tag) => {
      return tag !== undefined;
    });
}

export function parseNote(content: string): ParsedNote {
  const fallback: ParsedNote = {
    body: content,
    frontmatter: { pinned: false, tags: [] },
    rawLines: [],
  };

  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return fallback;
  }

  const lines = content.split("\n");
  const closeIndex = lines.findIndex((line, index) => {
    return index > 0 && CLOSING_DELIMITERS.has(line.trimEnd());
  });

  if (closeIndex === -1) {
    return fallback;
  }

  // CRLF files leave a trailing \r on every split line; strip it here so
  // `composeNote`'s \n joins cannot emit a block with mixed line endings.
  const rawLines = lines.slice(1, closeIndex).map((line) => {
    return line.replace(/\r$/, "");
  });
  const body = lines.slice(closeIndex + 1).join("\n");
  const frontmatter: Frontmatter = { pinned: false, tags: [] };

  let inTagsList = false;

  for (const line of rawLines) {
    const trimmed = line.trimEnd();

    if (inTagsList) {
      const item = trimmed.trimStart();

      if (item.startsWith("- ")) {
        const tag = cleanTag(item.slice(2));

        if (tag !== undefined) {
          frontmatter.tags.push(tag);
        }

        continue;
      }

      inTagsList = false;
    }

    const separator = trimmed.indexOf(":");

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (key === "pinned") {
      frontmatter.pinned = value.toLowerCase() === "true";
    } else if (key === "tags") {
      if (value === "") {
        inTagsList = true;
      } else {
        frontmatter.tags = parseInlineTags(value);
      }
    }
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
 */
export function updateFrontmatter(
  content: string,
  patch: Partial<Frontmatter>,
): string {
  const parsed = parseNote(content);
  const next: Frontmatter = {
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
    ...new Set(
      next.tags.map(cleanTag).filter((tag) => {
        return tag !== undefined;
      }),
    ),
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
