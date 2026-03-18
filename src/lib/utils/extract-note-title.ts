import { stripMarkdown } from "./strip-markdown";
import { truncate } from "./truncate";

const MAX_TITLE_LENGTH = 80;

export const extractNoteTitle = (content: string): string => {
  const firstLine =
    content.split("\n").find((line) => line.trim().length > 0) ?? content;

  return truncate(stripMarkdown(firstLine), MAX_TITLE_LENGTH);
};
