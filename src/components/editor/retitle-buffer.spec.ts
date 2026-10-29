import { describe, expect, it } from "vitest";

import { resolveTitle } from "@/core/notes";

import { renameDocument } from "./retitle-buffer";

describe("naming heading", () => {
  it("should preserve frontmatter and body while changing the heading", () => {
    expect(
      renameDocument(
        "---\ntitle: imported\ncustom: keep\n---\n# old\n\nbody",
        "Weekend errands"
      )
    ).toBe(
      "---\ntitle: imported\ncustom: keep\n---\n# Weekend errands\n\nbody"
    );
  });

  it("should introduce a heading for a prose-only note", () => {
    expect(renameDocument("body", "Weekend errands")).toBe(
      "# Weekend errands\n\nbody"
    );
  });

  it("should rewrite an existing leading heading", () => {
    expect(renameDocument("# old\n\nbody\n", "new")).toBe("# new\n\nbody\n");
  });

  it("should rewrite a leading heading behind blank lines", () => {
    expect(renameDocument("\n\n# old\nbody", "new")).toBe("\n\n# new\nbody");
  });

  it("should keep a heading's indentation", () => {
    expect(renameDocument("  # old\nbody\n", "new")).toBe("  # new\nbody\n");
  });

  it.each([
    ["prose", "just prose\n# later\n"],
    ["a deeper heading", "## section\nbody\n"],
    ["a list", "- item\n"],
    ["a fence", "```\n# not a heading\n```\n"],
    ["no indent room", "    # four spaces\n"],
    ["an empty body", ""],
  ])(
    "should introduce a heading above a body opening with %s",
    (_label, body) => {
      expect(renameDocument(body, "new")).toBe(`# new\n\n${body}`);
    }
  );

  it.each([
    ["", "empty"],
    ["  ", "blank"],
    ["a\nb", "a line break"],
  ])("should refuse a name that is %j (%s)", (title) => {
    expect(() => renameDocument("# old\n", title)).toThrow(
      "A name must be one nonempty line"
    );
  });

  it("should round-trip through resolveTitle", () => {
    expect(
      resolveTitle("note.md", renameDocument("# old\n", "effect: a primer"))
    ).toBe("effect: a primer");
  });
});
