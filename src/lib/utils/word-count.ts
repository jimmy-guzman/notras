import { parseNote } from "@/core";

const WORDS_PER_MINUTE = 200;

export function countWords(content: string) {
  const { body } = parseNote(content);
  const words = body
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  return words.length;
}

export function readingTime(words: number) {
  if (words === 0) {
    return "0 min";
  }

  return `${Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))} min`;
}
