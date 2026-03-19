import { SNIPPET_END, SNIPPET_START } from "@/server/db/fts-markers";

interface SnippetPart {
  id: number;
  match: boolean;
  text: string;
}

function getPartsLength(parts: SnippetPart[]) {
  return parts.reduce((sum, part) => sum + part.text.length, 0);
}

function slicePartsByCharRange(
  parts: SnippetPart[],
  startOffset: number,
  endOffset: number,
) {
  const sliced: Omit<SnippetPart, "id">[] = [];

  let cursor = 0;

  for (const part of parts) {
    const partStart = cursor;
    const partEnd = cursor + part.text.length;
    const overlapStart = Math.max(partStart, startOffset);
    const overlapEnd = Math.min(partEnd, endOffset);

    if (overlapStart < overlapEnd) {
      const startInPart = overlapStart - partStart;
      const endInPart = overlapEnd - partStart;

      sliced.push({
        match: part.match,
        text: part.text.slice(startInPart, endInPart),
      });
    }

    cursor = partEnd;
  }

  return sliced;
}

export function getSnippetParts(snippet: string): SnippetPart[] {
  const tokens = snippet.split(/(\[\[hl\]\]|\[\[\/hl\]\])/);

  let isMatch = false;

  return tokens.flatMap((token, id) => {
    if (token === SNIPPET_START) {
      isMatch = true;

      return [];
    }

    if (token === SNIPPET_END) {
      isMatch = false;

      return [];
    }

    if (token.length === 0) {
      return [];
    }

    return [{ id, match: isMatch, text: token }];
  });
}

export function getCenteredSnippetParts(snippet: string, maxChars = 80) {
  const parts = getSnippetParts(snippet);
  const totalLength = getPartsLength(parts);

  if (totalLength <= maxChars) {
    return parts.map((part, id) => ({ ...part, id }));
  }

  const firstMatchIndex = parts.findIndex((part) => part.match);
  const cursorAtMatchStart = parts
    .slice(0, Math.max(0, firstMatchIndex))
    .reduce((sum, part) => sum + part.text.length, 0);
  const firstMatchLength =
    firstMatchIndex === -1 ? 0 : parts[firstMatchIndex].text.length;
  const focusOffset =
    firstMatchIndex === -1 ? 0 : cursorAtMatchStart + firstMatchLength / 2;

  let startOffset = Math.max(0, Math.floor(focusOffset - maxChars / 2));

  const endOffset = Math.min(totalLength, startOffset + maxChars);

  if (endOffset - startOffset < maxChars) {
    startOffset = Math.max(0, endOffset - maxChars);
  }

  const sliced = slicePartsByCharRange(parts, startOffset, endOffset);
  const withEllipses = [
    ...(startOffset > 0 ? [{ match: false, text: "..." }] : []),
    ...sliced,
    ...(endOffset < totalLength ? [{ match: false, text: "..." }] : []),
  ];

  return withEllipses.map((part, id) => ({ ...part, id }));
}
