/**
 * The caret rides through the markdown converters as a sentinel character:
 * serialize/parse the document with the sentinel at the caret, then look at
 * where it landed. Exact by construction -- no fuzzy anchor matching.
 *
 * U+E000 (private use area): never produced by typing, untouched by the
 * serializer, marked, and the nbsp scrub.
 */
export const SENTINEL = "";

export function insertSentinel(text: string, offset: number) {
  const clamped = Math.max(0, Math.min(offset, text.length));

  return text.slice(0, clamped) + SENTINEL + text.slice(clamped);
}

interface DocLike {
  descendants: (
    callback: (node: { isText: boolean; text?: string }, pos: number) => boolean
  ) => void;
}

/** Absolute position of the sentinel character in a parsed doc, or null. */
export function findSentinel(doc: DocLike): null | number {
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
