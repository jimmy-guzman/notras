import { Schema } from "effect";

import { NOTE_TITLE_PATTERN } from "@/core";

// `Schema.Trim` normalizes; `Schema.trimmed()` would reject "my note " with
// Effect's generic message instead of just saving it.
export const noteTitleSchema = Schema.Trim.pipe(
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

export const folderNameSchema = Schema.Trim.pipe(
  Schema.maxLength(120, {
    message: () => {
      return "folder must be 120 characters or fewer";
    },
  }),
  // Returning a string is the single-argument way to attach a message (the
  // options-object overload trips unicorn/no-array-method-this-argument).
  Schema.filter((value) => {
    const valid =
      value === "" ||
      value.split("/").every((segment) => {
        return NOTE_TITLE_PATTERN.test(segment);
      });

    return valid
      ? undefined
      : String.raw`folder cannot contain \ : or start with a dot`;
  }),
);
