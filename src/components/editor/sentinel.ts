import type { Node } from "@tiptap/pm/model";

/**
 * The caret rides through the markdown converters as a sentinel character:
 * serialize/parse the document with the sentinel at the caret, then look at
 * where it landed. No fuzzy anchor matching: a block that cannot keep the
 * file's text reports no offset at all, apart from a blank line, whose caret
 * sits where the line starts.
 *
 * U+E000 (private use area): never produced by typing. The table renderer keeps
 * it out of a column's width, and marked drops it past a table's last pipe and
 * keeps it in a link's attributes.
 */
export const SENTINEL = "";

export function insertSentinel(text: string, offset: number) {
  const clamped = Math.max(0, Math.min(offset, text.length));

  return text.slice(0, clamped) + SENTINEL + text.slice(clamped);
}

/** Absolute position of the sentinel character in a parsed doc, or null. */
export function findSentinel(doc: Node): null | number {
  let found: null | number = null;

  doc.descendants((node, pos) => {
    if (found !== null) {
      return false;
    }

    if (node.isText) {
      const index = node.text?.indexOf(SENTINEL) ?? -1;

      if (index !== -1) {
        found = pos + index;

        return false;
      }
    }

    return true;
  });

  return found;
}
