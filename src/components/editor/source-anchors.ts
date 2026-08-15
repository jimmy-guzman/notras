/**
 * Anchor math for the rich <-> source mode transition (recipe proven in
 * scratch): map the cursor's top-level block between the WYSIWYG doc and
 * the raw markdown so toggling never loses your place.
 */

/**
 * Character offsets where each top-level markdown block starts. Blocks are
 * separated by blank lines, with awareness of code fences (no block starts
 * inside) and ATX headings (always start one).
 */
export function getMarkdownBlockOffsets(md: string): number[] {
  const offsets: number[] = [];
  const lines = md.split("\n");

  let pos = 0;
  // Treat document start as preceded by a blank line.
  let prevBlank = true;
  let inCodeFence = false;
  // Leading frontmatter is its own block, and `composeNote` puts no blank
  // line after the closing fence -- the next line still starts a block.
  let inFrontmatter = false;

  for (const [lineNumber, line] of lines.entries()) {
    const trimmed = line.trimStart();

    if (inFrontmatter) {
      const isClosing = trimmed === "---" || trimmed === "...";

      if (isClosing) {
        inFrontmatter = false;
        prevBlank = true;
      }
    } else if (lineNumber === 0 && trimmed === "---") {
      offsets.push(pos);
      inFrontmatter = true;
    } else if (inCodeFence) {
      if (trimmed.startsWith("```")) {
        inCodeFence = false;
      }
    } else if (trimmed.startsWith("```")) {
      offsets.push(pos);
      inCodeFence = true;
      prevBlank = false;
    } else {
      const isBlank = trimmed === "";

      if (!isBlank && (prevBlank || trimmed.startsWith("#"))) {
        offsets.push(pos);
      }

      prevBlank = isBlank;
    }

    pos += line.length + 1;
  }

  return offsets;
}

/** Index of the block containing `offset` (last block start <= offset). */
export function offsetToBlockIndex(offsets: number[], offset: number) {
  let index = 0;

  for (const [i, start] of offsets.entries()) {
    if (start <= offset) {
      index = i;
    }
  }

  return index;
}

/** How much trailing context we carry across a mode switch. */
export const ANCHOR_LENGTH = 24;

const ANCHOR_LADDER = [ANCHOR_LENGTH, 16, 12, 8, 5, 3];

/**
 * Find where `anchor` (the text just before the caret on one side) ends
 * inside `haystack` (the same block on the other side). Markdown syntax
 * makes exact matches fail, so progressively shorter suffixes of the
 * anchor are tried. Returns the offset just past the match, or -1.
 */
export function findAnchor(haystack: string, anchor: string) {
  const trimmed = anchor.slice(-ANCHOR_LENGTH);

  for (const length of ANCHOR_LADDER) {
    const suffix = trimmed.slice(-length);

    if (suffix === "") {
      continue;
    }

    const index = haystack.indexOf(suffix);

    if (index !== -1) {
      return index + suffix.length;
    }
  }

  return -1;
}

/**
 * Strip inline markdown syntax so source-side anchors can match the rich
 * editor's visible text (`**bold**` -> `bold`, `[x](url)` -> `x(url)` --
 * imperfect around links, which the suffix ladder absorbs).
 */
export function stripInlineSyntax(text: string) {
  return text.replaceAll(/[*_~`[\]#>]/g, "");
}

interface DocLike {
  child(index: number): { nodeSize: number };
  childCount: number;
}

/** ProseMirror position at the start of the Nth top-level block. */
export function blockIndexToPos(doc: DocLike, blockIndex: number) {
  const index = Math.max(0, Math.min(blockIndex, doc.childCount - 1));

  // 1 for the doc opening token.
  let pos = 1;

  for (let i = 0; i < index; i += 1) {
    pos += doc.child(i).nodeSize;
  }

  return pos;
}
