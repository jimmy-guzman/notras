import { Schema } from "effect";

import { NOTE_TITLE_PATTERN } from "@/core";

// `Schema.Trim` normalizes; `Schema.isTrimmed()` would reject "my note " with
// Effect's generic message instead of just saving it.
export const noteTitleSchema = Schema.Trim.pipe(
  Schema.check(
    Schema.isMinLength(1, { message: "title is required" }),
    Schema.isMaxLength(120, {
      message: "title must be 120 characters or fewer",
    }),
    Schema.isPattern(NOTE_TITLE_PATTERN, {
      message: String.raw`title cannot contain / \ : or start with a dot`,
    }),
  ),
);

export const folderNameSchema = Schema.Trim.pipe(
  Schema.check(
    Schema.isMaxLength(120, {
      message: "folder must be 120 characters or fewer",
    }),
    // Returning a string is the single-argument way to attach a message (the
    // annotations overload trips unicorn/no-array-method-this-argument).
    Schema.makeFilter<string>((value) => {
      const valid =
        value === "" ||
        value.split("/").every((segment) => {
          return NOTE_TITLE_PATTERN.test(segment);
        });

      return valid
        ? undefined
        : String.raw`folder cannot contain \ : or start with a dot`;
    }),
  ),
);
