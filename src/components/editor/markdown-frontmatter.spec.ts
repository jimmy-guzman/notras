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

  it("should read an opening rule followed by a blank line as Markdown", () => {
    const lines = coloredLines(
      "---\n\n# heading\nkey: value\n\n---\n\n# after"
    );

    expect(lines[2]).toStrictEqual([
      { color: "var(--syntax-keyword)", content: "# heading" },
    ]);
    expect(lines[3]).toStrictEqual([]);
  });

  it("should read an unclosed opening rule followed by a heading as Markdown", () => {
    const lines = coloredLines("---\n# Title\n\nbody");

    expect(lines[1]).toStrictEqual([
      { color: "var(--syntax-keyword)", content: "# Title" },
    ]);
    expect(lines[3]).toStrictEqual([]);
  });

  it("should read an unclosed opening rule followed by a line with a colon but no key as Markdown", () => {
    const lines = coloredLines("---\n**Note:** read this\n\n# Heading");

    expect(lines[3]).toStrictEqual([
      { color: "var(--syntax-keyword)", content: "# Heading" },
    ]);
  });

  it.each([
    "**Note**: read this",
    "> Quote: from someone",
    "* item: detail",
    '"Hi", she said: hello',
  ])(
    "should read an unclosed opening rule followed by the Markdown line %s as Markdown",
    (line) => {
      const lines = coloredLines(`---\n${line}\n\n# Heading`);

      expect(lines[3]).toStrictEqual([
        { color: "var(--syntax-keyword)", content: "# Heading" },
      ]);
    }
  );

  it("should color frontmatter being typed whose key opens a list", () => {
    const lines = coloredLines("---\ntags:\n  - a");

    expect(lines[1]).toContainEqual({
      color: "var(--syntax-member)",
      content: "tags",
    });
  });

  it("should color frontmatter being typed whose first key is indented", () => {
    const lines = coloredLines("---\n  title: x");

    expect(lines[1]).toContainEqual({
      color: "var(--syntax-member)",
      content: "title",
    });
  });

  it.each(['"title"', "'title'", '"a:b"', '"title" ', "'it''s'"])(
    "should color frontmatter being typed whose key is the quoted %s",
    (key) => {
      const lines = coloredLines(`---\n${key}: x`);

      expect(lines[1]).toContainEqual({
        color: "var(--syntax-member)",
        content: key,
      });
    }
  );

  it("should read a rule that opens the body after frontmatter as Markdown", () => {
    const lines = coloredLines(
      "---\npinned: true\n---\n---\nkey: value\n---\n# after"
    );

    expect(lines[4]).toStrictEqual([]);
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
