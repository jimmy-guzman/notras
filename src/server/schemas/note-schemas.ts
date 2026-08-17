import { Schema } from "effect";

import { NOTE_SEGMENT_PATTERN } from "@/core";

// A title carries no charset restriction: `D32` resolves it from frontmatter or
// a heading, and `filenameFromTitle` derives a legal filename from whatever it
// says. Only emptiness and a line break are rejected, the second because it
// would split a heading in two.
export const noteTitleSchema = Schema.Trim.pipe(
  Schema.check(
    Schema.isMinLength(1, { message: "title is required" }),
    Schema.makeFilter<string>((value) => {
      return /[\n\r]/.test(value) ? "title cannot span lines" : undefined;
    }),
  ),
);

// `Schema.Trim` normalizes; `Schema.isTrimmed()` would reject "my note " with
// Effect's generic message instead of just saving it.
//
// This validates a filename, not a title. Note creation names a file directly;
// retitling goes through `noteTitleSchema` above.
export const noteFilenameSchema = Schema.Trim.pipe(
  Schema.check(
    Schema.isMinLength(1, { message: "filename is required" }),
    Schema.isMaxLength(120, {
      message: "filename must be 120 characters or fewer",
    }),
    Schema.isPattern(NOTE_SEGMENT_PATTERN, {
      message: String.raw`filename cannot contain / \ : or start with a dot`,
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
          return NOTE_SEGMENT_PATTERN.test(segment);
        });

      return valid
        ? undefined
        : String.raw`folder cannot contain \ : or start with a dot`;
    }),
  ),
);
