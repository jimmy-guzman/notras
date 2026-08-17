import {
  composeNote,
  parseNote,
  retitleFrontmatter,
  updateFrontmatter,
} from "./frontmatter";

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
      "---\npinned: true\ntags: [Errands, home]\n---\n- eggs\n",
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
      "---\r\npinned: true\r\ncustom: x\r\n---\r\nbody\r\n",
    );

    expect(parsed.frontmatter.pinned).toBe(true);
    expect(parsed.rawLines).toStrictEqual(["pinned: true", "custom: x"]);
    expect(composeNote(parsed.rawLines, "body\n")).toBe(
      "---\npinned: true\ncustom: x\n---\nbody\n",
    );
  });
});

describe("updateFrontmatter", () => {
  it("should add a block to a note without one", () => {
    const next = updateFrontmatter("# hello\n", { pinned: true });

    expect(next).toBe("---\npinned: true\n---\n# hello\n");
  });

  it("should remove the block when values return to defaults", () => {
    const next = updateFrontmatter("---\npinned: true\n---\nbody\n", {
      pinned: false,
    });

    expect(next).toBe("body\n");
  });

  it("should preserve unknown keys verbatim", () => {
    const content =
      "---\ncustom: thing\npinned: true\nauthor: someone\n---\nbody\n";
    const next = updateFrontmatter(content, { tags: ["work"] });

    expect(next).toBe(
      "---\npinned: true\ntags: [work]\ncustom: thing\nauthor: someone\n---\nbody\n",
    );
  });

  it("should preserve a title key through a pin toggle", () => {
    const content = '---\ntitle: "effect: a primer"\n---\nbody\n';
    const next = updateFrontmatter(content, { pinned: true });

    expect(next).toBe(
      '---\npinned: true\ntitle: "effect: a primer"\n---\nbody\n',
    );
    expect(parseNote(next).frontmatter.title).toBe("effect: a primer");
  });

  it("should replace block-list tags with the inline form", () => {
    const content = "---\ntags:\n  - old\n  - stale\nkeep: me\n---\nbody\n";
    const next = updateFrontmatter(content, { tags: ["fresh"] });

    expect(next).toBe("---\ntags: [fresh]\nkeep: me\n---\nbody\n");
  });

  it("should not let a tag separator split into two tags", () => {
    const next = updateFrontmatter("body\n", { tags: ["a,b"] });

    expect(next).toBe("---\ntags: [ab]\n---\nbody\n");
    expect(parseNote(next).frontmatter.tags).toStrictEqual(["ab"]);
  });

  it("should round-trip parse after update", () => {
    const next = updateFrontmatter("body\n", {
      pinned: true,
      tags: ["a", "b"],
    });
    const parsed = parseNote(next);

    expect(parsed.frontmatter).toStrictEqual({
      pinned: true,
      tags: ["a", "b"],
      title: undefined,
    });
    expect(parsed.body).toBe("body\n");
  });
});

describe("composeNote", () => {
  it("should return the body alone when there is no frontmatter", () => {
    expect(composeNote([], "# hi\n")).toBe("# hi\n");
  });

  it("should wrap raw lines in delimiters", () => {
    expect(composeNote(["pinned: true", "custom: x"], "body\n")).toBe(
      "---\npinned: true\ncustom: x\n---\nbody\n",
    );
  });

  it("should round-trip through parseNote with the body replaced", () => {
    const original = "---\npinned: true\ntags: [a]\n---\nold body\n";
    const parsed = parseNote(original);
    const next = composeNote(parsed.rawLines, "new body\n");
    const reparsed = parseNote(next);

    expect(reparsed.frontmatter).toStrictEqual(parsed.frontmatter);
    expect(reparsed.body).toBe("new body\n");
  });
});

describe("retitleFrontmatter", () => {
  it("should rewrite an existing key where it sits", () => {
    expect(
      retitleFrontmatter(["pinned: true", "title: old", "custom: x"], "new"),
    ).toStrictEqual(["pinned: true", "title: new", "custom: x"]);
  });

  it("should never introduce a key", () => {
    const lines = ["pinned: true", "tags: [a]"];

    expect(retitleFrontmatter(lines, "new")).toStrictEqual(lines);
    expect(retitleFrontmatter([], "new")).toStrictEqual([]);
  });

  it("should quote a title carrying a colon so real yaml survives", () => {
    expect(
      retitleFrontmatter(["title: old"], "effect: a primer"),
    ).toStrictEqual(['title: "effect: a primer"']);
  });

  it("should preserve indentation", () => {
    expect(retitleFrontmatter(["  title: old"], "new")).toStrictEqual([
      "  title: new",
    ]);
  });

  it("should round-trip a colon through parseNote", () => {
    const lines = retitleFrontmatter(["title: old"], "effect: a primer");

    expect(parseNote(composeNote(lines, "body")).frontmatter.title).toBe(
      "effect: a primer",
    );
  });
});
