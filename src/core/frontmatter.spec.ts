import { describe, expect, it } from "vitest";
import { composeNote, parseNote, updateFrontmatter } from "@/core/frontmatter";
import fixtures from "../../fixtures/note-mutations.json";

it("should preserve nested metadata when editing note-level pin and tags", () => {
  const content =
    "---\nplugin:\n  pinned: true\n  tags:\n    - nested\n  title: plugin title\n---\nbody";
  expect(parseNote(content).frontmatter).toEqual({
    pinned: false,
    tags: [],
    title: undefined,
  });
  expect(updateFrontmatter(content, { pinned: true, tags: ["note"] })).toBe(
    "---\npinned: true\ntags: [note]\nplugin:\n  pinned: true\n  tags:\n    - nested\n  title: plugin title\n---\nbody"
  );
});

describe("metadata changes", () => {
  it("should remove the block when the last note-level value is cleared", () => {
    const content = updateFrontmatter("---\npinned: true\n---\nbody\n", {
      pinned: false,
    });
    expect(content).toBe("body\n");
    expect(parseNote(content)).toEqual({
      body: "body\n",
      frontmatter: { pinned: false, tags: [], title: undefined },
      raw: undefined,
    });
  });

  it.each(fixtures.metadata)(
    "should preserve the document while applying $patch",
    ({ content, expected, patch }) => {
      expect(updateFrontmatter(content, patch)).toBe(expected);
    }
  );
});

describe("parseNote", () => {
  it("should return the whole content as body when there is no frontmatter", () => {
    const parsed = parseNote("# hello\n");

    expect(parsed.body).toBe("# hello\n");
    expect(parsed.frontmatter).toStrictEqual({
      pinned: false,
      tags: [],
      title: undefined,
    });
  });

  it("should parse pinned and inline tags", () => {
    const parsed = parseNote(
      "---\npinned: true\ntags: [Errands, home]\n---\n- eggs\n"
    );

    expect(parsed.frontmatter.pinned).toBe(true);
    expect(parsed.frontmatter.tags).toStrictEqual(["errands", "home"]);
    expect(parsed.body).toBe("- eggs\n");
  });

  it("should parse block list tags", () => {
    const parsed = parseNote('---\ntags:\n  - "work"\n  - ideas\n---\nbody\n');

    expect(parsed.frontmatter.tags).toStrictEqual(["work", "ideas"]);
    expect(parsed.body).toBe("body\n");
  });

  it("should treat an unclosed block as plain body", () => {
    const parsed = parseNote("---\npinned: true\nno close");

    expect(parsed.frontmatter.pinned).toBe(false);
    expect(parsed.body).toBe("---\npinned: true\nno close");
  });

  it("should dedupe tags that are not adjacent", () => {
    const parsed = parseNote("---\ntags: [a, b, A]\n---\nbody");

    expect(parsed.frontmatter.tags).toStrictEqual(["a", "b"]);
  });

  it("should strip separators from tags", () => {
    const parsed = parseNote('---\ntags:\n  - "a,b"\n---\nbody\n');

    expect(parsed.frontmatter.tags).toStrictEqual(["ab"]);
  });

  it("should close on the ... delimiter", () => {
    const parsed = parseNote("---\npinned: true\n...\nbody\n");

    expect(parsed.frontmatter.pinned).toBe(true);
    expect(parsed.body).toBe("body\n");
  });

  it("should close on a delimiter with trailing space", () => {
    const parsed = parseNote("---\npinned: true\n---  \nbody\n");

    expect(parsed.frontmatter.pinned).toBe(true);
    expect(parsed.body).toBe("body\n");
  });

  it("should strip carriage returns from raw lines of a crlf file", () => {
    const parsed = parseNote(
      "---\r\npinned: true\r\ncustom: x\r\n---\r\nbody\r\n"
    );

    expect(parsed.frontmatter.pinned).toBe(true);
    expect(parsed.raw?.lines).toStrictEqual(["pinned: true", "custom: x"]);
    expect(composeNote(parsed.raw, "body\n")).toBe(
      "---\npinned: true\ncustom: x\n---\nbody\n"
    );
  });
});

describe("composeNote", () => {
  it("should return the body alone when there is no frontmatter", () => {
    expect(composeNote(undefined, "# hi\n")).toBe("# hi\n");
  });

  it("should wrap raw lines in delimiters", () => {
    expect(
      composeNote(
        { close: "---", lines: ["pinned: true", "custom: x"] },
        "body\n"
      )
    ).toBe("---\npinned: true\ncustom: x\n---\nbody\n");
  });

  it("should keep an empty block rather than dropping its delimiters", () => {
    expect(composeNote({ close: "---", lines: [] }, "body\n")).toBe(
      "---\n---\nbody\n"
    );
  });

  it("should round-trip through parseNote with the body replaced", () => {
    const original = "---\npinned: true\ntags: [a]\n---\nold body\n";
    const parsed = parseNote(original);
    const next = composeNote(parsed.raw, "new body\n");
    const reparsed = parseNote(next);

    expect(reparsed.frontmatter).toStrictEqual(parsed.frontmatter);
    expect(reparsed.body).toBe("new body\n");
  });

  it.each([
    "---\n---\nbody\n",
    "---\n---\n",
    "---\n...\nbody\n",
    "---\npinned: true\n...\nbody\n",
    "---\npinned: true\ntags: [a]\n---\nbody\n",
    "---\n\n---\nbody\n",
    "just a body\n",
  ])("should round-trip %j byte for byte", (original) => {
    const parsed = parseNote(original);

    expect(composeNote(parsed.raw, parsed.body)).toBe(original);
  });
});
