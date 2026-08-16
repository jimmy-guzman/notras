import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { folderNameSchema, noteTitleSchema } from "./note-schemas";

const decodeTitle = Schema.decodePromise(noteTitleSchema);
const decodeFolder = Schema.decodePromise(folderNameSchema);

/**
 * These messages reach the user verbatim through `toast.error(error.message)`,
 * so they are pinned rather than smoke-tested.
 */
describe("noteTitleSchema", () => {
  it("should trim surrounding whitespace", async () => {
    await expect(decodeTitle(" my note ")).resolves.toBe("my note");
  });

  it("should reject an empty title", async () => {
    await expect(decodeTitle("")).rejects.toThrow("title is required");
  });

  it("should reject a title longer than 120 characters", async () => {
    await expect(decodeTitle("a".repeat(121))).rejects.toThrow(
      "title must be 120 characters or fewer",
    );
  });

  it.each([["a/b"], [String.raw`a\b`], ["a:b"], [".hidden"]])(
    "should reject %s",
    async (title) => {
      await expect(decodeTitle(title)).rejects.toThrow(
        String.raw`title cannot contain / \ : or start with a dot`,
      );
    },
  );
});

describe("folderNameSchema", () => {
  it.each([[""], ["work"], ["work/2026"], [" work "]])(
    "should accept %s",
    async (folder) => {
      await expect(decodeFolder(folder)).resolves.toBe(folder.trim());
    },
  );

  it("should reject a folder longer than 120 characters", async () => {
    await expect(decodeFolder("a".repeat(121))).rejects.toThrow(
      "folder must be 120 characters or fewer",
    );
  });

  it.each([[String.raw`a\b`], ["a:b"], [".hidden"], ["work/.hidden"]])(
    "should reject %s",
    async (folder) => {
      await expect(decodeFolder(folder)).rejects.toThrow(
        String.raw`folder cannot contain \ : or start with a dot`,
      );
    },
  );
});
