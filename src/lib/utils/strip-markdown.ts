export const stripMarkdown = (text: string): string => {
  return (
    text
      // headings: ## Heading → Heading
      .replaceAll(/^#{1,6}\s+/gm, "")
      // blockquotes: > text → text
      .replaceAll(/^>\s+/gm, "")
      // unordered list markers: - item / * item
      .replaceAll(/^[-*]\s+/gm, "")
      // ordered list markers: 1. item
      .replaceAll(/^\d+\.\s+/gm, "")
      // images: ![alt](url) → alt
      .replaceAll(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // links: [text](url) → text
      .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // bold+italic: ***text*** / ___text___
      .replaceAll(/\*{3}([^*]+)\*{3}/g, "$1")
      .replaceAll(/_{3}([^_]+)_{3}/g, "$1")
      // bold: **text** / __text__
      .replaceAll(/\*{2}([^*]+)\*{2}/g, "$1")
      .replaceAll(/_{2}([^_]+)_{2}/g, "$1")
      // italic: *text* / _text_
      .replaceAll(/\*([^*]+)\*/g, "$1")
      .replaceAll(/_([^_]+)_/g, "$1")
      // strikethrough: ~~text~~
      .replaceAll(/~~([^~]+)~~/g, "$1")
      // inline code: `code`
      .replaceAll(/`([^`]+)`/g, "$1")
      // horizontal rules
      .replaceAll(/^[-*_]{3,}\s*$/gm, "")
      // collapse extra whitespace
      .replaceAll(/\s+/g, " ")
      .trim()
  );
};
