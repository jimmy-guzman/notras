import { describe, expect, it } from "vitest";

import { highlightCode } from "./syntax-highlighter";

/** The colored runs of each line, with the text each one covers. */
function coloredLines(source: string) {
  const tokens = highlightCode(source, "markdown");
  let start = 0;

  return source.split("\n").map((line) => {
    const end = start + line.length;

    const colored = tokens
      .filter(({ offset }) => offset >= start && offset < end)
      .map(({ color, length, offset }) => ({
        color,
        content: source.slice(offset, offset + length),
      }));

    start = end + 1;

    return colored;
  });
}

describe("markdown with frontmatter", () => {
  it.each(["---", "...", "---  "])(
    "should close frontmatter on %s and highlight the following heading",
    (delimiter) => {
      const lines = coloredLines(`---\npinned: true\n${delimiter}\n# a title`);

      expect(lines[1]).toContainEqual({
        color: "var(--syntax-member)",
        content: "pinned",
      });
      expect(
        lines[3]?.some(
          (token) =>
            token.color === "var(--syntax-keyword)" &&
            token.content.includes("a title")
        )
      ).toBeTruthy();
    }
  );

  it("should color frontmatter that is not closed yet", () => {
    const lines = coloredLines("---\npinned: true");

    expect(lines[1]).toContainEqual({
      color: "var(--syntax-member)",
      content: "pinned",
    });
  });

  it("should not read a closing delimiter as a setext heading", () => {
    const lines = coloredLines("---\ntags: [notras]\n---\n# a title");

    expect(lines[1]).toContainEqual({
      color: "var(--syntax-member)",
      content: "tags",
    });
    expect(lines[2]).toStrictEqual([
      { color: "var(--syntax-punctuation)", content: "---" },
    ]);
  });

  it("should leave later separators outside the frontmatter lexer", () => {
    const lines = coloredLines(
      "---\npinned: true\n---\nbefore\n\n---\n\nafter: text"
    );

    expect(lines[7]).toStrictEqual([]);
  });

  it("should highlight a language inside a Markdown fence", () => {
    const lines = coloredLines("```ts\nconst answer = 42;\n```");

    expect(lines[1]).toContainEqual({
      color: "var(--syntax-keyword)",
      content: "const ",
    });
    expect(lines[1]).toContainEqual({
      color: "var(--syntax-number)",
      content: "42",
    });
  });
});
