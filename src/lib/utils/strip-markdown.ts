/**
 * Strips common Markdown syntax from a string, returning plain text suitable
 * for use in previews and list item titles.
 */
export const stripMarkdown = (text: string): string => {
  return text
    .replaceAll(/^#{1,6}\s+/gm, "")
    .replaceAll(/^>\s+/gm, "")
    .replaceAll(/^[-*]\s+/gm, "")
    .replaceAll(/^\d+\.\s+/gm, "")
    .replaceAll(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/\*{3}([^*]+)\*{3}/g, "$1")
    .replaceAll(/_{3}([^_]+)_{3}/g, "$1")
    .replaceAll(/\*{2}([^*]+)\*{2}/g, "$1")
    .replaceAll(/_{2}([^_]+)_{2}/g, "$1")
    .replaceAll(/\*([^*]+)\*/g, "$1")
    .replaceAll(/\b_([^_]+)_\b/g, "$1")
    .replaceAll(/~~([^~]+)~~/g, "$1")
    .replaceAll(/`([^`]+)`/g, "$1")
    .replaceAll(/^[-*_]{3,}\s*$/gm, "")
    .replaceAll(/\s+/g, " ")
    .trim();
};
