import { describe, expect, it } from "vitest";

import { loadSyntaxHighlighter } from "@/components/editor/syntax-highlighter";

describe("markdown with frontmatter", () => {
  it.each(["---", "...", "---  "])(
    "should close frontmatter on %s and highlight the following heading",
    async (delimiter) => {
      const highlighter = await loadSyntaxHighlighter(["markdown", "yaml"]);
      const tokens = highlighter.codeToTokensBase(
        `---\npinned: true\n${delimiter}\n# a title`,
        {
          lang: "markdown",
          theme: "notras",
        }
      );

      expect(tokens[1]).toContainEqual(
        expect.objectContaining({
          color: "var(--syntax-member)",
          content: "pinned",
        })
      );
      expect(tokens[3]).toContainEqual(
        expect.objectContaining({
          color: "var(--syntax-keyword)",
          content: expect.stringContaining("a title"),
        })
      );
    }
  );

  it("should not read a closing delimiter as a setext heading", async () => {
    const highlighter = await loadSyntaxHighlighter(["markdown", "yaml"]);
    const tokens = highlighter.codeToTokensBase(
      "---\ntags: [notras]\n---\n# a title",
      { lang: "markdown", theme: "notras" }
    );

    expect(tokens[1]).toContainEqual(
      expect.objectContaining({
        color: "var(--syntax-member)",
        content: "tags",
      })
    );
    expect(
      tokens[2]?.every(({ color }) => color === "var(--syntax-punctuation)")
    ).toBe(true);
  });

  it("should leave later separators outside the frontmatter grammar", async () => {
    const highlighter = await loadSyntaxHighlighter(["markdown", "yaml"]);
    const source = "---\npinned: true\n---\nbefore\n\n---\n\nafter: text";
    const tokens = highlighter.codeToTokensBase(source, {
      lang: "markdown",
      theme: "notras",
    });

    expect(tokens[7]).toEqual([
      expect.objectContaining({
        color: "var(--foreground)",
        content: "after: text",
      }),
    ]);
  });

  it("should highlight a language inside a Markdown fence", async () => {
    const highlighter = await loadSyntaxHighlighter(["markdown", "typescript"]);
    const tokens = highlighter.codeToTokensBase(
      "```ts\nconst answer = 42;\n```",
      { lang: "markdown", theme: "notras" }
    );

    expect(tokens[1]).toContainEqual(
      expect.objectContaining({
        color: "var(--syntax-keyword)",
        content: "const",
      })
    );
    expect(tokens[1]).toContainEqual(
      expect.objectContaining({ color: "var(--syntax-number)", content: "42" })
    );
  });
});
