import { composeNote, parseNote, updateFrontmatter } from "./frontmatter";

describe("parseNote", () => {
  it("should return the whole content as body when there is no frontmatter", () => {
    const parsed = parseNote("# hello\n");

    expect(parsed.body).toBe("# hello\n");
    expect(parsed.frontmatter).toStrictEqual({ pinned: false, tags: [] });
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

  it("should dedupe tags", () => {
    const parsed = parseNote("---\ntags: [a, A, a]\n---\nbody");

    expect(parsed.frontmatter.tags).toStrictEqual(["a"]);
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

  it("should replace block-list tags with the inline form", () => {
    const content = "---\ntags:\n  - old\n  - stale\nkeep: me\n---\nbody\n";
    const next = updateFrontmatter(content, { tags: ["fresh"] });

    expect(next).toBe("---\ntags: [fresh]\nkeep: me\n---\nbody\n");
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
