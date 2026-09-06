import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { attachmentLink } from "@/lib/utils/attachments";
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
function load(markdown: string) {
  const editor = new Editor({
    content: markdown,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });

  // The markdown parser builds JSON and `Node.fromJSON` takes it on trust, so
  // an illegal doc reaches the view and throws on the first `contentMatchAt`.
  // Checking here is what makes every case below a schema test as well.
  editor.state.doc.check();

  return editor;
}

function roundtrip(markdown: string) {
  const editor = load(markdown);
  const output = serializeMarkdown(editor);

  editor.destroy();

  return output;
}

/** The src of every image a markdown string parses into, wherever it sits. */
function imageSources(markdown: string) {
  const editor = load(markdown);
  const sources: string[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === "image") {
      sources.push(String(node.attrs.src));
    }

    return true;
  });

  editor.destroy();

  return sources;
}

describe("markdown round-trip", () => {
  it.each([
    ["heading", "# hello"],
    ["emphasis", "some **bold** and *italic* and ~~struck~~ text"],
    ["inline code", "run `pnpm dev` locally"],
    ["bold code", "**`--typeset-size`** sets the size"],
    ["italic code", "*`x`* leans"],
    ["struck code", "~~`x`~~ is gone"],
    ["linked code", "[`x`](https://example.com)"],
    ["code inside bold", "**bold `code` text**"],
    [
      "image label with a bracket",
      "![notes \\].png](attachments/notes%20%5D.png)",
    ],
    ["image label with a backslash", "![back\\slash.png](attachments/x.png)"],
    [
      "image label with two backslashes",
      "![back\\\\slash.png](attachments/x.png)",
    ],
    ["image title with a quote", '![a](attachments/x.png "say \\"hi\\"")'],
    [
      "link label with a bracket",
      "[report \\].pdf](attachments/report%20%5D.pdf)",
    ],
    ["link title with a quote", '[a](https://example.com "say \\"hi\\"")'],
    ["title with a backslash", '![a](attachments/x.png "back\\\\slash")'],
    [
      "image label with a backslash before a bracket",
      "![back\\\\\\].png](attachments/back%5C%5D.png)",
    ],
    ["bullet list", "- one\n- two"],
    ["ordered list", "1. first\n2. second"],
    ["nested bullet list", "- one\n  - nested"],
    ["nested ordered list", "1. first\n   1. nested"],
    ["blockquote", "> quoted"],
    ["link", "[notes](https://example.com)"],
    ["image with relative src", "![shot](attachments/x.png)"],
    ["image with an encoded src", "![shot](attachments/my%20shot.png)"],
    ["attachment link", "[my notes.pdf](attachments/my%20notes.pdf)"],
    ["horizontal rule", "---"],
    ["wikilink", "see [[grocery list]] for details"],
    ["literal tilde", "takes approx ~5 minutes"],
    ["literal underscore", "the snake_case name"],
    ["literal asterisk", "2 * 3 = 6"],
    ["literal bracket", "the [draft] copy"],
    ["escaped tilde a strike would eat", "\\~one\\~"],
    ["escaped asterisks emphasis would eat", "\\*one\\*"],
  ])("should round-trip %s", (_name, markdown) => {
    expect(roundtrip(markdown)).toBe(markdown);
  });

  it("should canonicalize a single-tilde strike read from a file", () => {
    expect(roundtrip("~organization~")).toBe("~~organization~~");
  });

  it("should keep a note escaped when one construct needs its backslash", () => {
    const markdown = "the snake\\_case name\n\n![notes \\].png](notes.png)";

    expect(roundtrip(markdown)).toBe(markdown);
  });

  it("should parse a dropped attachment whose name has spaces as an image", () => {
    const markdown = attachmentLink(
      "attachments/Screenshot 2026-08-26 at 6.25.40 AM.png"
    );

    expect(imageSources(markdown)).toEqual([
      "attachments/Screenshot%202026-08-26%20at%206.25.40%20AM.png",
    ]);
    expect(roundtrip(markdown)).toBe(markdown);
  });

  it("should keep an angle-bracket image destination loadable after a save", () => {
    const saved = roundtrip("![a](<attachments/my shot.png>)");

    expect(saved).toBe("![a](attachments/my%20shot.png)");
    expect(imageSources(saved)).toEqual(["attachments/my%20shot.png"]);
  });

  it.each([
    ["alone in its block", "![a](attachments/x.png)"],
    ["after text on the same line", "text ![a](attachments/x.png)"],
    ["before text on the same line", "![a](attachments/x.png) text"],
    ["after a hard break", 'text  \n![a](attachments/x.png "Title")'],
    ["inside a list item", "- item ![a](attachments/x.png)"],
    ["inside a task item", "- [ ] item ![a](attachments/x.png)"],
    ["inside a table cell", "| a |\n| --- |\n| ![a](attachments/x.png) |"],
    ["inside a blockquote", "> ![a](attachments/x.png)"],
    [
      "whose label holds a backslash before a bracket",
      "![back\\\\\\].png](attachments/x.png)",
    ],
  ])("should parse an image %s", (_name, markdown) => {
    expect(imageSources(markdown)).toContain("attachments/x.png");
  });

  it("should keep an angle-bracket link destination loadable after a save", () => {
    const saved = roundtrip("[my notes.pdf](<attachments/my notes.pdf>)");

    expect(saved).toBe("[my notes.pdf](attachments/my%20notes.pdf)");
    expect(roundtrip(saved)).toBe(saved);
  });

  it("should normalize a non-ascii destination on save", () => {
    expect(roundtrip("[a](https://ex.com/café)")).toBe(
      "[a](https://ex.com/caf%C3%A9)"
    );
  });

  it("should round-trip task lists with checked state", () => {
    const markdown = "- [ ] todo\n\n- [x] done";
    const output = roundtrip(markdown);

    expect(output).toContain("[ ] todo");
    expect(output).toContain("[x] done");
  });

  it("should round-trip a bullet list nested under a task item", () => {
    const markdown = "- [ ] better command palette\n  - organization";

    expect(roundtrip(markdown)).toBe(markdown);
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
      "use `&nbsp;` for a hard space"
    );
    expect(roundtrip("```html\n<p>a&nbsp;b</p>\n<p>c&#160;d</p>\n```")).toBe(
      "```html\n<p>a&nbsp;b</p>\n<p>c&#160;d</p>\n```"
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
      "```\n&nbsp;\n```\n "
    );
    expect(normalizeMarkdown("```\n&nbsp;\n   ```  \n&nbsp;")).toBe(
      "```\n&nbsp;\n   ```  \n "
    );
  });

  it("should require the closing run to match the opening character", () => {
    const markdown = "~~~\n```\n&nbsp;\n~~~";

    expect(normalizeMarkdown(markdown)).toBe(markdown);
  });
});
