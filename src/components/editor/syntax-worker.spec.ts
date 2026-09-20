import { describe, expect, it } from "vitest";

import type { SyntaxToken } from "@/components/editor/syntax-highlighter";
import { tokenize } from "@/components/editor/syntax-worker";

let nextDocument = 0;

function freshDocument() {
  nextDocument += 1;
  return nextDocument;
}

function contentOf(source: string, lines: SyntaxToken[][], start = 0) {
  const texts = source.split("\n");

  return lines.flatMap((line, index) =>
    line.map(({ color, length, offset }) => ({
      color,
      content: texts[start + index]?.slice(offset, offset + length),
    }))
  );
}

async function coloredText(source: string, language: string) {
  const { lines } = await tokenize(source, language, freshDocument());

  return contentOf(source, lines);
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

  it("should answer every line of a document it has not seen", async () => {
    const splice = await tokenize(
      "const a = 1;\nlet b = 2;",
      "typescript",
      freshDocument()
    );

    expect(splice).toMatchObject({ start: 0, tail: 0 });
    expect(splice.lines).toHaveLength(2);
  });

  it("should answer only the changed line when the lines after it tokenize as before", async () => {
    const document = freshDocument();
    const before = "const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;";
    await tokenize(before, "typescript", document);

    const after = "const a = 1;\nlet b = 2;\nconst c = 3;\nconst d = 4;";
    const splice = await tokenize(after, "typescript", document);

    expect(splice).toMatchObject({ start: 1, tail: 2 });
    const alone = await tokenize("let b = 2;", "typescript", freshDocument());
    expect(contentOf(after, splice.lines, splice.start)).toStrictEqual(
      contentOf("let b = 2;", alone.lines)
    );
  });

  it("should retokenize the lines after an edit that opens a fence", async () => {
    const document = freshDocument();
    await tokenize(
      "# title\n\nprose\n\n```ts\nconst a = 1;\n```",
      "markdown",
      document
    );

    const after = "# title\n```\nprose\n\n```ts\nconst a = 1;\n```";
    const splice = await tokenize(after, "markdown", document);

    expect(splice).toMatchObject({ start: 1, tail: 0 });
    expect(splice.lines).toHaveLength(6);
    expect(contentOf(after, splice.lines, splice.start)).not.toContainEqual({
      color: "var(--syntax-keyword)",
      content: "const",
    });
  });

  it("should keep the lines it remembers apart by document", async () => {
    const first = freshDocument();
    await tokenize("const a = 1;", "typescript", first);
    const other = await tokenize("let b = 2;", "typescript", freshDocument());
    const again = await tokenize("const a = 1;", "typescript", first);

    expect(contentOf("let b = 2;", other.lines)).toContainEqual({
      color: "var(--syntax-keyword)",
      content: "let",
    });
    expect(again).toStrictEqual({ lines: [], start: 1, tail: 0 });
  });
});
