import { stripMarkdown } from "./strip-markdown";

describe("stripMarkdown", () => {
  it("should return plain text unchanged", () => {
    expect(stripMarkdown("hello world")).toBe("hello world");
  });

  it("should strip heading markers", () => {
    expect(stripMarkdown("# Heading one")).toBe("Heading one");
    expect(stripMarkdown("## Heading two")).toBe("Heading two");
    expect(stripMarkdown("### Heading three")).toBe("Heading three");
  });

  it("should strip blockquote markers", () => {
    expect(stripMarkdown("> quoted text")).toBe("quoted text");
  });

  it("should strip unordered list markers", () => {
    expect(stripMarkdown("- list item")).toBe("list item");
    expect(stripMarkdown("* list item")).toBe("list item");
  });

  it("should strip ordered list markers", () => {
    expect(stripMarkdown("1. first item")).toBe("first item");
    expect(stripMarkdown("42. some item")).toBe("some item");
  });

  it("should strip bold syntax", () => {
    expect(stripMarkdown("**bold text**")).toBe("bold text");
    expect(stripMarkdown("__bold text__")).toBe("bold text");
  });

  it("should strip italic syntax", () => {
    expect(stripMarkdown("*italic text*")).toBe("italic text");
    expect(stripMarkdown("_italic text_")).toBe("italic text");
  });

  it("should not strip underscores inside word identifiers", () => {
    expect(stripMarkdown("foo_bar_baz")).toBe("foo_bar_baz");
    expect(stripMarkdown("some_variable_name")).toBe("some_variable_name");
  });

  it("should strip bold+italic syntax", () => {
    expect(stripMarkdown("***bold italic***")).toBe("bold italic");
    expect(stripMarkdown("___bold italic___")).toBe("bold italic");
  });

  it("should strip strikethrough syntax", () => {
    expect(stripMarkdown("~~struck through~~")).toBe("struck through");
  });

  it("should strip inline code", () => {
    expect(stripMarkdown("`some code`")).toBe("some code");
  });

  it("should collapse link syntax to text", () => {
    expect(stripMarkdown("[link text](https://example.com)")).toBe("link text");
  });

  it("should collapse image syntax to alt text", () => {
    expect(stripMarkdown("![alt text](https://example.com/img.png)")).toBe(
      "alt text",
    );
  });

  it("should strip horizontal rules", () => {
    expect(stripMarkdown("---")).toBe("");
    expect(stripMarkdown("***")).toBe("");
    expect(stripMarkdown("___")).toBe("");
  });

  it("should handle mixed inline syntax", () => {
    expect(stripMarkdown("**bold** and *italic* and `code`")).toBe(
      "bold and italic and code",
    );
  });

  it("should collapse extra whitespace", () => {
    expect(stripMarkdown("  too   many   spaces  ")).toBe("too many spaces");
  });
});
