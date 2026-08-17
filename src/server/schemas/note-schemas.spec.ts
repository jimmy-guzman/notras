import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  folderNameSchema,
  noteFilenameSchema,
  noteTitleSchema,
} from "./note-schemas";

const decodeFilename = Schema.decodePromise(noteFilenameSchema);
const decodeFolder = Schema.decodePromise(folderNameSchema);
const decodeTitle = Schema.decodePromise(noteTitleSchema);

/**
 * These messages reach the user verbatim through `toast.error(error.message)`,
 * so they are pinned rather than smoke-tested.
 */
describe("noteFilenameSchema", () => {
  it("should trim surrounding whitespace", async () => {
    await expect(decodeFilename(" my note ")).resolves.toBe("my note");
  });

  it("should reject an empty filename", async () => {
    await expect(decodeFilename("")).rejects.toThrow("filename is required");
  });

  it("should reject a filename longer than 120 characters", async () => {
    await expect(decodeFilename("a".repeat(121))).rejects.toThrow(
      "filename must be 120 characters or fewer",
    );
  });

  it.each([["a/b"], [String.raw`a\b`], ["a:b"], [".hidden"]])(
    "should reject %s",
    async (filename) => {
      await expect(decodeFilename(filename)).rejects.toThrow(
        String.raw`filename cannot contain / \ : or start with a dot`,
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

describe("noteTitleSchema", () => {
  it("should trim surrounding whitespace", async () => {
    await expect(decodeTitle("  my note  ")).resolves.toBe("my note");
  });

  it("should reject an empty title", async () => {
    await expect(decodeTitle("   ")).rejects.toThrow("title is required");
  });

  it("should reject a title spanning lines", async () => {
    await expect(decodeTitle("a\nb")).rejects.toThrow(
      "title cannot span lines",
    );
  });

  // The charset a filename rejects is exactly what a title is free to use.
  it.each([["a/b"], [String.raw`a\b`], ["effect: a primer"], ["🔥 hot takes"]])(
    "should accept %s",
    async (title) => {
      await expect(decodeTitle(title)).resolves.toBe(title);
    },
  );
});
