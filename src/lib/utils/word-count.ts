import { parseNote } from "@/core/frontmatter";

const WORDS_PER_MINUTE = 200;

const WHITESPACE_RUN = /\s+/;

export function countWords(content: string) {
  const { body } = parseNote(content);
  const words = body
    .trim()
    .split(WHITESPACE_RUN)
    .filter((word) => word.length > 0);

  return words.length;
}

export function readingTime(words: number) {
  if (words === 0) {
    return "0 min";
  }

  return `${Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))} min`;
}
