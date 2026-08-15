import {
  blockIndexToPos,
  getMarkdownBlockOffsets,
  offsetToBlockIndex,
} from "./source-anchors";

describe("getMarkdownBlockOffsets", () => {
  it("should start blocks after blank lines", () => {
    const md = "first\n\nsecond\n\nthird";

    expect(getMarkdownBlockOffsets(md)).toStrictEqual([0, 7, 15]);
  });

  it("should start a block at an atx heading even without a blank line", () => {
    const md = "para\n## heading\nmore";

    expect(getMarkdownBlockOffsets(md)).toStrictEqual([0, 5]);
  });

  it("should not start blocks inside code fences", () => {
    const md = "```ts\n\n# not a heading\n\nconst a = 1\n```\n\nafter";
    const offsets = getMarkdownBlockOffsets(md);

    expect(offsets).toStrictEqual([0, md.indexOf("after")]);
  });

  it("should treat frontmatter as its own block even without a blank line after it", () => {
    const md = "---\npinned: true\n---\nbody paragraph\n\nsecond";

    expect(getMarkdownBlockOffsets(md)).toStrictEqual([
      0,
      md.indexOf("body"),
      md.indexOf("second"),
    ]);
  });
});

describe("offsetToBlockIndex", () => {
  const offsets = [0, 10, 20];

  it("should find the containing block", () => {
    expect(offsetToBlockIndex(offsets, 0)).toBe(0);
    expect(offsetToBlockIndex(offsets, 9)).toBe(0);
    expect(offsetToBlockIndex(offsets, 10)).toBe(1);
    expect(offsetToBlockIndex(offsets, 99)).toBe(2);
  });

  it("should handle empty offset lists", () => {
    expect(offsetToBlockIndex([], 5)).toBe(0);
  });
});

describe("blockIndexToPos", () => {
  const doc = {
    child: (index: number) => {
      return { nodeSize: [4, 6, 8][index] ?? 0 };
    },
    childCount: 3,
  };

  it("should sum node sizes plus the doc opening token", () => {
    expect(blockIndexToPos(doc, 0)).toBe(1);
    expect(blockIndexToPos(doc, 1)).toBe(5);
    expect(blockIndexToPos(doc, 2)).toBe(11);
  });

  it("should clamp out-of-range indexes", () => {
    expect(blockIndexToPos(doc, 99)).toBe(11);
    expect(blockIndexToPos(doc, -1)).toBe(1);
  });
});
