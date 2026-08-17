import { describe, expect, it } from "vitest";

import { parseNote } from "./frontmatter";
import {
  filenameFromTitle,
  NOTE_SEGMENT_PATTERN,
  resolveTitle,
  retitleLeadingHeading,
} from "./notes";

/**
 * The title-resolution parity table. The `resolves_titles_from_frontmatter_
 * then_heading_then_filename` test in `src-tauri/src/index.rs` asserts the same
 * cases in the same order, so the two resolvers can be diffed by eye.
 */
const cases: [content: string, path: string, expected: string][] = [
  // Frontmatter wins over a heading that disagrees.
  [
    "---\ntitle: from frontmatter\n---\n# from heading\n",
    "note.md",
    "from frontmatter",
  ],
  [
    '---\ntitle: "effect: a primer"\n---\nbody\n',
    "note.md",
    "effect: a primer",
  ],
  ["---\ntitle: effect: a primer\n---\nbody\n", "note.md", "effect: a primer"],
  // An empty title is absent, so the heading takes over.
  ["---\ntitle:\n---\n# from heading\n", "note.md", "from heading"],
  // Heading beats the filename.
  ["# from heading\n", "note.md", "from heading"],
  ["\n\n# after blank lines\n", "note.md", "after blank lines"],
  ["   # three spaces\n", "note.md", "three spaces"],
  ["# closed form #\n", "note.md", "closed form"],
  ["# closed form ###\n", "note.md", "closed form"],
  // No whitespace before the trailing run, so it is part of the text.
  ["# C#\n", "note.md", "C#"],
  ["#\ttab after hash\n", "note.md", "tab after hash"],
  // Not headings: too much indent, deeper level, no space, empty.
  ["    # four spaces\n", "note.md", "note"],
  ["## level two\n", "note.md", "note"],
  ["#nospace\n", "note.md", "note"],
  ["#\n", "note.md", "note"],
  // A heading below content is a section heading, not the title.
  ["intro paragraph\n\n# a section\n", "note.md", "note"],
  // A fence opener cannot match, so code blocks need no tracking.
  ["```\n# not a heading\n```\n", "note.md", "note"],
  // Filename fallback.
  ["just an idea\n", "work/ideas.md", "ideas"],
  ["", "untitled.md", "untitled"],
  ["# crlf heading\r\n", "note.md", "crlf heading"],
  ["---\r\ntitle: crlf fm\r\n---\r\nbody\r\n", "note.md", "crlf fm"],
];

describe("resolveTitle", () => {
  it.each(cases)("should resolve %j at %j to %j", (content, path, expected) => {
    const parsed = parseNote(content);

    expect(resolveTitle(path, parsed.body, parsed.frontmatter.title)).toBe(
      expected,
    );
  });

  it("should strip the markdown extension case-insensitively", () => {
    expect(resolveTitle("NOTE.MD", "body\n")).toBe("NOTE");
    expect(resolveTitle("note.md", "body\n")).toBe("note");
    expect(resolveTitle("note.markdown", "body\n")).toBe("note");
  });
});

describe("retitleLeadingHeading", () => {
  it("should rewrite an existing leading heading", () => {
    expect(retitleLeadingHeading("# old\n\nbody\n", "new")).toBe(
      "# new\n\nbody\n",
    );
  });

  it("should skip blank lines and frontmatter is already stripped", () => {
    expect(retitleLeadingHeading("\n\n# old\nbody", "new")).toBe(
      "\n\n# new\nbody",
    );
  });

  it("should preserve indentation and a crlf ending", () => {
    expect(retitleLeadingHeading("  # old\r\nbody\r\n", "new")).toBe(
      "  # new\r\nbody\r\n",
    );
  });

  it.each([
    ["prose", "just prose\n# later\n"],
    ["a deeper heading", "## section\nbody\n"],
    ["a list", "- item\n"],
    ["a fence", "```\n# not a heading\n```\n"],
    ["no indent room", "    # four spaces\n"],
    ["an empty body", ""],
  ])("should leave a body opening with %s byte-identical", (_label, body) => {
    expect(retitleLeadingHeading(body, "new")).toBe(body);
  });

  it.each([
    ["", "empty"],
    ["a\nb", "a line break"],
  ])("should refuse a title that is %j (%s)", (title) => {
    expect(retitleLeadingHeading("# old\n", title)).toBe("# old\n");
  });

  it("should round-trip through resolveTitle", () => {
    const body = retitleLeadingHeading("# old\n", "effect: a primer");

    expect(resolveTitle("note.md", body)).toBe("effect: a primer");
  });
});

describe("filenameFromTitle", () => {
  it.each([
    ["team sync", "team-sync"],
    ["Effect: A Primer", "effect-a-primer"],
    [String.raw`a/b\c:d`, "a-b-c-d"],
    ["  padded  ", "padded"],
    ["lots   of    space", "lots-of-space"],
    ["a -- b", "a-b"],
    [".hidden", "hidden"],
    ["trailing...", "trailing"],
    ["v1.2 notes", "v1.2-notes"],
    ["///", "untitled"],
    ["", "untitled"],
    ["...", "untitled"],
  ])("should turn %j into %j", (title, expected) => {
    expect(filenameFromTitle(title)).toBe(expected);
  });

  it("should cap the length and leave no trailing separator", () => {
    const filename = filenameFromTitle(`${"a".repeat(119)} tail`);

    expect(filename).toHaveLength(119);
    expect(filename.endsWith("-")).toBe(false);
  });

  it("should always produce a legal path segment", () => {
    const titles = [
      "Effect: A Primer",
      "a/b",
      ".hidden",
      "",
      "///",
      "café notes",
    ];

    for (const title of titles) {
      expect(filenameFromTitle(title)).toMatch(NOTE_SEGMENT_PATTERN);
    }
  });
});
