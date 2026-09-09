import { describe, expect, it } from "vitest";

import {
  loadSyntaxHighlighter,
  syntaxLanguage,
} from "@/components/editor/syntax-highlighter";

describe("syntax highlighting", () => {
  it("should distinguish declarations, imports, flow, types, and functions", async () => {
    const highlighter = await loadSyntaxHighlighter(["typescript"]);
    const tokens = highlighter
      .codeToTokensBase(
        // biome-ignore lint/suspicious/noTemplateCurlyInString: This is source text for the highlighter, not a test template.
        'import { readFile } from "node:fs/promises";\nexport async function read(path: string): Promise<string> {\n const text = await readFile(path, "utf8");\n if (text) return `${path}: ${text}`;\n}',
        { lang: "typescript", theme: "notras" }
      )
      .flat();

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
      expect(tokens, content).toContainEqual(
        expect.objectContaining({ color, content })
      );
    }
    expect(
      tokens.every(
        ({ fontStyle }) => fontStyle === 0 || fontStyle === undefined
      )
    ).toBe(true);
  });

  it("should keep interpolation variables separate from string text", async () => {
    const highlighter = await loadSyntaxHighlighter(["typescript"]);
    const tokens = highlighter
      // biome-ignore lint/suspicious/noTemplateCurlyInString: The interpolation must reach the grammar verbatim.
      .codeToTokensBase("`hello ${name}`", {
        lang: "typescript",
        theme: "notras",
      })
      .flat();

    expect(tokens).toContainEqual(
      expect.objectContaining({
        color: "var(--syntax-string)",
        content: "hello ",
      })
    );
    expect(tokens).toContainEqual(
      expect.objectContaining({ color: "var(--foreground)", content: "name" })
    );
  });

  it("should keep comments, headings, and source emphasis at regular weight", async () => {
    const highlighter = await loadSyntaxHighlighter(["markdown", "typescript"]);
    for (const { lang, source } of [
      { lang: "typescript", source: "// a comment\nconst a = true;" },
      { lang: "markdown", source: "# heading\n**bold** and *italic*" },
    ]) {
      const tokens = highlighter
        .codeToTokensBase(source, { lang, theme: "notras" })
        .flat();
      expect(tokens.map(({ content }) => content).join("")).not.toBe("");
      expect(
        tokens.every(
          ({ fontStyle }) => fontStyle === 0 || fontStyle === undefined
        )
      ).toBe(true);
    }
  });

  it("should highlight JSON keys as members and values as strings", async () => {
    const highlighter = await loadSyntaxHighlighter(["json"]);
    const tokens = highlighter
      .codeToTokensBase('{"name": "notras"}', { lang: "json", theme: "notras" })
      .flat();

    expect(tokens).toContainEqual(
      expect.objectContaining({
        color: "var(--syntax-member)",
        content: "name",
      })
    );
    expect(tokens).toContainEqual(
      expect.objectContaining({
        color: "var(--syntax-string)",
        content: "notras",
      })
    );
  });

  it("should resolve language aliases while leaving plain and unknown labels unhighlighted", () => {
    expect(syntaxLanguage("ts")).toBe("typescript");
    expect(syntaxLanguage("TSX")).toBe("tsx");
    expect(syntaxLanguage("sh")).toBe("shellscript");
    for (const label of [
      null,
      "",
      "text",
      "plain",
      "plaintext",
      "not-a-language",
    ]) {
      expect(syntaxLanguage(label)).toBeUndefined();
    }
  });

  it("should preserve offsets across blank lines, CRLF, and Unicode", async () => {
    const highlighter = await loadSyntaxHighlighter(["typescript"]);
    const source = '// 🙂\r\n\r\nconst café = "你好";\r\n';
    const tokens = highlighter
      .codeToTokensBase(source, { lang: "typescript", theme: "notras" })
      .flat();

    for (const { content, offset } of tokens) {
      expect(source.slice(offset, offset + content.length)).toBe(content);
    }
    expect(tokens).toContainEqual(expect.objectContaining({ content: "café" }));
  });
});
