import { Editor } from "@tiptap/core";

import {
  createEditorExtensions,
  normalizeMarkdown,
  serializeMarkdown,
} from "./extensions";

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

  it("should keep nbsp entities that are the author's code, not ours", () => {
    expect(roundtrip("use `&nbsp;` for a hard space")).toBe(
      "use `&nbsp;` for a hard space",
    );
    expect(roundtrip("```html\n<p>a&nbsp;b</p>\n<p>c&#160;d</p>\n```")).toBe(
      "```html\n<p>a&nbsp;b</p>\n<p>c&#160;d</p>\n```",
    );
  });
});

/**
 * The fence scanner decides where the scrub may run, so a line it mistakes
 * for a closing fence hands the rest of a code block to the scrubber.
 */
describe("normalizeMarkdown", () => {
  it("should not close a fence on a run carrying an info string", () => {
    const markdown = "```\n```js is not a close\n&nbsp;\n```";

    expect(normalizeMarkdown(markdown)).toBe(markdown);
  });

  it("should not close a fence on trailing prose after the run", () => {
    const markdown = "```\n``` still open\n&#160;\n```";

    expect(normalizeMarkdown(markdown)).toBe(markdown);
  });

  it("should not close a fence on an indented run", () => {
    const markdown = "```\n    ```\n&nbsp;\n```";

    expect(normalizeMarkdown(markdown)).toBe(markdown);
  });

  it("should not close a fence on a tab-prefixed run", () => {
    const markdown = "```\n\t```\n&nbsp;\n```";

    expect(normalizeMarkdown(markdown)).toBe(markdown);
  });

  it("should not open a fence on a tab-prefixed run", () => {
    expect(normalizeMarkdown("\t```\n&nbsp;")).toBe("\t```\n ");
  });

  it("should close on a bare run and scrub the prose after it", () => {
    expect(normalizeMarkdown("```\n&nbsp;\n```\n&nbsp;")).toBe(
      "```\n&nbsp;\n```\n ",
    );
    expect(normalizeMarkdown("```\n&nbsp;\n   ```  \n&nbsp;")).toBe(
      "```\n&nbsp;\n   ```  \n ",
    );
  });

  it("should require the closing run to match the opening character", () => {
    const markdown = "~~~\n```\n&nbsp;\n~~~";

    expect(normalizeMarkdown(markdown)).toBe(markdown);
  });
});
