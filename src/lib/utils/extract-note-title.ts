import { stripMarkdown } from "./strip-markdown";
import { truncate } from "./truncate";

const MAX_TITLE_LENGTH = 80;

export const extractNoteTitle = (content: string): string => {
  const stripped =
    content
      .split("\n")
      .map((line) => stripMarkdown(line))
      .find((line) => line.trim().length > 0) ?? stripMarkdown(content);

  return truncate(stripped, MAX_TITLE_LENGTH);
};
