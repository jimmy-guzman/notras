import { Editor } from "@tiptap/core";

import { createEditorExtensions, serializeMarkdown } from "./extensions";

/**
 * The markdown round-trip contract: what goes into a file must come back
 * out unchanged (modulo canonical normalization) for every construct the
 * app supports. Files are the source of truth, so this IS the data-safety
 * test for the editor.
 */
function roundtrip(markdown: string) {
  const editor = new Editor({
    content: markdown,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });
  const output = serializeMarkdown(editor);

  editor.destroy();

  return output;
}

describe("markdown round-trip", () => {
  it.each([
    ["heading", "# hello"],
    ["emphasis", "some **bold** and *italic* and ~~struck~~ text"],
    ["inline code", "run `pnpm dev` locally"],
    ["bullet list", "- one\n- two"],
    ["ordered list", "1. first\n2. second"],
    ["blockquote", "> quoted"],
    ["link", "[notes](https://example.com)"],
    ["image with relative src", "![shot](attachments/x.png)"],
    ["horizontal rule", "---"],
    ["wikilink", "see [[grocery list]] for details"],
  ])("should round-trip %s", (_name, markdown) => {
    expect(roundtrip(markdown)).toBe(markdown);
  });

  it("should round-trip task lists with checked state", () => {
    const markdown = "- [ ] todo\n\n- [x] done";
    const output = roundtrip(markdown);

    expect(output).toContain("[ ] todo");
    expect(output).toContain("[x] done");
  });

  it("should round-trip fenced code with language", () => {
    const markdown = "```ts\nconst a = 1;\n```";

    expect(roundtrip(markdown)).toBe(markdown);
  });

  it("should round-trip tables (cells pad to a canonical width)", () => {
    const markdown = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    const compact = roundtrip(markdown).replaceAll(/ +/g, " ").trim();

    expect(compact).toContain("| a | b |");
    expect(compact).toContain("| 1 | 2 |");
  });

  it("should be stable: serializing twice yields the same text", () => {
    const markdown =
      "# doc\n\n- [x] task\n\n> quote\n\n```ts\nconst a = 1;\n```\n\n[[wiki]] and [link](https://a.b)";
    const once = roundtrip(markdown);
    const twice = roundtrip(once);

    expect(twice).toBe(once);
  });

  it("should never leak nbsp entities into files", () => {
    const markdown =
      "| a | b |\n| --- | --- |\n|  | 2 |\n\nparagraph\n\n- [ ] task";
    const output = roundtrip(markdown);

    expect(output).not.toContain("&nbsp;");
    expect(output).not.toContain("&#160;");
  });
});
