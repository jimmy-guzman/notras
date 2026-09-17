import { describe, expect, it } from "vitest";

import { tokenize } from "@/components/editor/syntax-worker";

async function coloredText(source: string, language: string) {
  const lines = await tokenize(source, language);

  return lines.flat().map(({ color, length, offset }) => ({
    color,
    content: source.slice(offset, offset + length),
  }));
}

describe("syntax tokenizing", () => {
  it("should distinguish declarations, imports, flow, types, and functions", async () => {
    const tokens = await coloredText(
      // oxlint-disable-next-line no-template-curly-in-string -- source text for the highlighter, not a test template
      'import { readFile } from "node:fs/promises";\nexport async function read(path: string): Promise<string> {\n const text = await readFile(path, "utf8");\n if (text) return `${path}: ${text}`;\n}',
      "typescript"
    );

    for (const [content, color] of [
      ["import", "var(--syntax-keyword-import)"],
      ["export", "var(--syntax-keyword-import)"],
      ["async", "var(--syntax-keyword-control)"],
      ["await", "var(--syntax-keyword-control)"],
      ["if", "var(--syntax-keyword-control)"],
      ["return", "var(--syntax-keyword-control)"],
      ["const", "var(--syntax-keyword)"],
      ["read", "var(--syntax-function)"],
      ["Promise", "var(--syntax-type)"],
      ["path", "var(--foreground)"],
    ]) {
      expect(tokens).toContainEqual({ color, content });
    }
  });

  it("should keep interpolation variables separate from string text", async () => {
    // oxlint-disable-next-line no-template-curly-in-string -- the interpolation must reach the grammar verbatim
    const tokens = await coloredText("`hello ${name}`", "typescript");

    expect(tokens).toContainEqual({
      color: "var(--syntax-string)",
      content: "hello ",
    });
    expect(tokens).toContainEqual({
      color: "var(--foreground)",
      content: "name",
    });
  });

  it("should highlight JSON keys as members and values as strings", async () => {
    const tokens = await coloredText('{"name": "notras"}', "json");

    expect(tokens).toContainEqual({
      color: "var(--syntax-member)",
      content: "name",
    });
    expect(tokens).toContainEqual({
      color: "var(--syntax-string)",
      content: "notras",
    });
  });

  it("should load the grammars a Markdown note embeds", async () => {
    const tokens = await coloredText(
      "---\npinned: true\n...\n# title\n\n```python\nreturn 42\n```",
      "markdown"
    );

    expect(tokens).toContainEqual({
      color: "var(--syntax-member)",
      content: "pinned",
    });
    expect(tokens).toContainEqual({
      color: "var(--syntax-keyword-control)",
      content: "return",
    });
  });

  it("should preserve offsets across blank lines, CRLF, and Unicode", async () => {
    const tokens = await coloredText(
      '// 🙂\r\n\r\nconst café = "你好";\r\n',
      "typescript"
    );

    expect(tokens).toContainEqual({
      color: "var(--syntax-keyword)",
      content: "const",
    });
    expect(tokens.map(({ content }) => content)).toContain("café");
    expect(tokens).toContainEqual({
      color: "var(--syntax-string)",
      content: "你好",
    });
  });
});
