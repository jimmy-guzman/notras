import { describe, expect, it } from "vitest";
import fixtures from "../../fixtures/note-mutations.json";
import titleCases from "../../fixtures/note-titles.json";

import { parseNote } from "./frontmatter";
import {
  bodyTitle,
  filenameFromTitle,
  resolveTitle,
  retitleLeadingHeading,
  titleSource,
} from "./notes";

const VALID_FILENAME = /^(?!\.)[^/\\:]+$/;

describe("resolveTitle", () => {
  it.each(titleCases)(
    "should resolve $name consistently with Rust",
    ({ content, path, expected, line }) => {
      const parsed = parseNote(content);
      expect(resolveTitle(path, parsed.body, parsed.frontmatter.title)).toBe(
        expected
      );
      expect(bodyTitle(parsed.body)?.line ?? null).toBe(line);
      const source = titleSource(content);
      expect(source?.title).toBe(
        line !== null || parsed.frontmatter.title !== undefined
          ? expected
          : undefined
      );
      if (source !== undefined && line !== null) {
        expect(content.slice(source.from, source.to)).toBe(
          parsed.body.split("\n")[line]
        );
      }
    }
  );

  // Mirrors `should_strip_the_markdown_extension_case_insensitively` in
  // `crates/notras-core/src/markdown.rs`, case for case, so the two cannot drift.
  it("should strip the markdown extension case-insensitively", () => {
    expect(resolveTitle("NOTE.MD", "")).toBe("NOTE");
    expect(resolveTitle("note.md", "")).toBe("note");
    expect(resolveTitle("Note.Markdown", "")).toBe("Note");
    expect(resolveTitle("note.markdown", "")).toBe("note");
    expect(resolveTitle("notes.txt", "")).toBe("notes.txt");
    expect(resolveTitle(".md", "")).toBe("");
  });
});

describe("retitleLeadingHeading", () => {
  it("should rewrite an existing leading heading", () => {
    expect(retitleLeadingHeading("# old\n\nbody\n", "new")).toBe(
      "# new\n\nbody\n"
    );
  });

  it("should skip blank lines and frontmatter is already stripped", () => {
    expect(retitleLeadingHeading("\n\n# old\nbody", "new")).toBe(
      "\n\n# new\nbody"
    );
  });

  it("should preserve indentation and a crlf ending", () => {
    expect(retitleLeadingHeading("  # old\r\nbody\r\n", "new")).toBe(
      "  # new\r\nbody\r\n"
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
  it("should leave a whole Unicode character at the filename limit", () => {
    expect(filenameFromTitle(`${"a".repeat(119)}😀`)).toBe("a".repeat(119));
    expect(filenameFromTitle(`${"a".repeat(118)}😀`)).toBe(
      `${"a".repeat(118)}😀`
    );
  });
  it.each(fixtures.filenames)(
    "should preserve the shared filename for $title",
    ({ title, expected }) => {
      expect(filenameFromTitle(title)).toBe(expected);
    }
  );
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
      expect(filenameFromTitle(title)).toMatch(VALID_FILENAME);
    }
  });
});
