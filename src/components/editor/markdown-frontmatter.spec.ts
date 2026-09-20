import { describe, expect, it } from "vitest";

import { tokenize } from "@/components/editor/syntax-worker";

let nextDocument = 0;

async function coloredLines(source: string) {
  nextDocument += 1;
  const { lines } = await tokenize(source, "markdown", nextDocument);
  const texts = source.split("\n");

  return lines.map((line, index) =>
    line.map(({ color, length, offset }) => ({
      color,
      content: texts[index]?.slice(offset, offset + length),
    }))
  );
}

describe("markdown with frontmatter", () => {
  it.each(["---", "...", "---  "])(
    "should close frontmatter on %s and highlight the following heading",
    async (delimiter) => {
      const lines = await coloredLines(
        `---\npinned: true\n${delimiter}\n# a title`
      );

      expect(lines[1]).toContainEqual({
        color: "var(--syntax-member)",
        content: "pinned",
      });
      expect(
        lines[3]?.some(
          (token) =>
            token.color === "var(--syntax-keyword)" &&
            token.content?.includes("a title") === true
        )
      ).toBeTruthy();
    }
  );

  it("should not read a closing delimiter as a setext heading", async () => {
    const lines = await coloredLines("---\ntags: [notras]\n---\n# a title");

    expect(lines[1]).toContainEqual({
      color: "var(--syntax-member)",
      content: "tags",
    });
    expect(
      lines[2]?.every(({ color }) => color === "var(--syntax-punctuation)")
    ).toBeTruthy();
  });

  it("should leave later separators outside the frontmatter grammar", async () => {
    const lines = await coloredLines(
      "---\npinned: true\n---\nbefore\n\n---\n\nafter: text"
    );

    expect(lines[7]).toStrictEqual([
      { color: "var(--foreground)", content: "after: text" },
    ]);
  });

  it("should highlight a language inside a Markdown fence", async () => {
    const lines = await coloredLines("```ts\nconst answer = 42;\n```");

    expect(lines[1]).toContainEqual({
      color: "var(--syntax-keyword)",
      content: "const",
    });
    expect(lines[1]).toContainEqual({
      color: "var(--syntax-number)",
      content: "42",
    });
  });
});
