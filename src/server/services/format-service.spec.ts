import { formatMarkdown } from "./format-service";

describe("formatMarkdown", () => {
  it("should normalize extra spaces in headings", async () => {
    const input = "# heading one\n\n##  heading two\n\nsome text";
    const result = await formatMarkdown(input);

    expect(result).toBe("# heading one\n\n## heading two\n\nsome text\n");
  });

  it("should normalize list item spacing", async () => {
    const input = "-  item one\n-  item two\n-  item three";
    const result = await formatMarkdown(input);

    expect(result).toBe("- item one\n- item two\n- item three\n");
  });

  it("should add trailing newline", async () => {
    const input = "hello world";
    const result = await formatMarkdown(input);

    expect(result).toBe("hello world\n");
  });

  it("should handle empty string", async () => {
    const result = await formatMarkdown("");

    expect(result).toBe("");
  });

  it("should handle whitespace-only string", async () => {
    const result = await formatMarkdown("   \n\n  ");

    expect(result).toStrictEqual(expect.stringMatching(/^\s*$/));
  });

  it("should format bold and italic markers", async () => {
    const input = "some **bold** and *italic* text";
    const result = await formatMarkdown(input);

    expect(result).toBe("some **bold** and _italic_ text\n");
  });

  it("should handle multiline content", async () => {
    const input = "first paragraph\n\nsecond paragraph\n\nthird paragraph";
    const result = await formatMarkdown(input);

    expect(result).toBe(
      "first paragraph\n\nsecond paragraph\n\nthird paragraph\n",
    );
  });

  it("should format gfm tables", async () => {
    const input = "| a | b |\n|---|---|\n| 1 | 2 |";
    const result = await formatMarkdown(input);

    expect(result).toBe("| a | b |\n| - | - |\n| 1 | 2 |\n");
  });

  it("should leave frontmatter untouched while formatting the body", async () => {
    const input = "---\npinned: true\ntags: [a]\n---\n##  heading\n";
    const result = await formatMarkdown(input);

    expect(result).toBe("---\npinned: true\ntags: [a]\n---\n## heading\n");
  });

  it("should preserve task lists", async () => {
    const input = "- [ ] todo\n- [x] done";
    const result = await formatMarkdown(input);

    expect(result).toBe("- [ ] todo\n- [x] done\n");
  });
});
