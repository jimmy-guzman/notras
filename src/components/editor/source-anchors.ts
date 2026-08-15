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

export interface CursorAnchor {
  anchorText: string;
  blockIndex: number;
}

interface BlockLike {
  descendants(
    callback: (
      node: { isText: boolean; nodeSize: number; text?: string },
      pos: number,
    ) => boolean,
  ): void;
}

/**
 * Map a visible-text offset within a top-level block back to a ProseMirror
 * position. Counts text runs by length and leaf atoms as one character,
 * mirroring how `textBetween(..., "", " ")` produced the searched text.
 */
function textOffsetToPos(block: BlockLike, blockStart: number, offset: number) {
  let remaining = offset;
  let result = blockStart;

  block.descendants((node, pos) => {
    if (remaining < 0) {
      return false;
    }

    if (node.isText) {
      const length = node.text?.length ?? 0;

      if (remaining <= length) {
        result = blockStart + pos + remaining;
        remaining = -1;

        return false;
      }

      remaining -= length;
    } else if (node.nodeSize === 1) {
      remaining -= 1;
      if (remaining <= 0) {
        result = blockStart + pos + 1;
        remaining = -1;

        return false;
      }
    }

    return true;
  });

  return remaining >= 0 ? blockStart : result;
}

interface AnchorDocLike {
  child(
    index: number,
  ): BlockLike & { content: { size: number }; nodeSize: number };
  childCount: number;
  textBetween(
    from: number,
    to: number,
    blockSeparator?: string,
    leafText?: string,
  ): string;
}

/** Resolve an anchor to a concrete caret position in the given doc. */
export function anchorToPos(doc: AnchorDocLike, anchor: CursorAnchor) {
  if (doc.childCount === 0) {
    return 0;
  }

  const clamped = Math.max(0, Math.min(anchor.blockIndex, doc.childCount - 1));
  const blockStart = blockIndexToPos(doc, clamped);
  const block = doc.child(clamped);
  const blockText = doc.textBetween(
    blockStart,
    blockStart + block.content.size,
    "",
    " ",
  );
  const matched =
    anchor.anchorText === "" ? -1 : findAnchor(blockText, anchor.anchorText);

  return matched === -1
    ? blockStart
    : textOffsetToPos(block, blockStart, matched);
}
