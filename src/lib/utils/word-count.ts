import { parseNote } from "@/core/frontmatter";

const WHITESPACE_RUN = /\s+/u;

export function countWords(content: string) {
  const { body } = parseNote(content);
  const words = body
    .trim()
    .split(WHITESPACE_RUN)
    .filter((word) => word.length > 0);

  return words.length;
}
