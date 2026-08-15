import { Schema } from "effect";

import { NOTE_TITLE_PATTERN } from "@/core";

export const noteTitleSchema = Schema.String.pipe(
  Schema.trimmed(),
  Schema.minLength(1, {
    message: () => {
      return "title is required";
    },
  }),
  Schema.maxLength(120, {
    message: () => {
      return "title must be 120 characters or fewer";
    },
  }),
  Schema.pattern(NOTE_TITLE_PATTERN, {
    message: () => {
      return String.raw`title cannot contain / \ : or start with a dot`;
    },
  }),
);

export const folderNameSchema = Schema.String.pipe(
  Schema.trimmed(),
  Schema.maxLength(120, {
    message: () => {
      return "folder must be 120 characters or fewer";
    },
  }),
  Schema.filter((value) => {
    return (
      value === "" ||
      value.split("/").every((segment) => {
        return NOTE_TITLE_PATTERN.test(segment);
      })
    );
  }),
);
