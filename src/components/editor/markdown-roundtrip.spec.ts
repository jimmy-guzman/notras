import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { attachmentLink } from "@/lib/utils/attachments";

import {
  converterOf,
  createEditorExtensions,
  rememberSources,
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
    "````markdown\n```ts\nconst value = 1;\n```\n````",
    "`````markdown\n````\n```\n&nbsp;\n`````",
    "```ts\n\nconst value = 1;\n\n\n```",
    "~~~lang`label\nconst value = 1;\n~~~\n\nafter",
    "~~~~~lang`label\n~~~~\n```ts\nconst value = 1;\n```\n~~~~~\n\nafter",
    "~~~lang`label\n\n~~~",
  ])(
    "should preserve code text and language across repeated saves: %s",
    (markdown) => {
      const editor = load(markdown);
      const before = editor.getJSON();
      const saved = serializeMarkdown(editor);

      editor.destroy();
      const reopened = load(saved);

      expect(reopened.getJSON()).toStrictEqual(before);
      expect(serializeMarkdown(reopened)).toBe(saved);
      reopened.destroy();
    }
  );

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
    ["image beside the note", "![shot](./shot.png)"],
    ["image up a folder", "![shot](../attachments/x.png)"],
    ["file link beside the note", "[spec](docs/my%20spec.pdf)"],
    ["horizontal rule", "---"],
    ["hard break", "one  \ntwo"],
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

  it("should canonicalize a backslash hard break read from a file", () => {
    expect(roundtrip("one\\\ntwo")).toBe("one  \ntwo");
  });

  it("should keep a hard break inside a table cell as a br tag", () => {
    const markdown = "| a |\n| --- |\n| one<br>two |";
    const compact = roundtrip(markdown).replaceAll(/ +/gu, " ").trim();

    expect(compact).toContain("| one<br>two |");
  });

  it("should write a block bare beside one that needs its backslash", () => {
    expect(
      roundtrip("the snake\\_case name\n\n![notes \\].png](notes.png)")
    ).toBe("the snake_case name\n\n![notes \\].png](notes.png)");
  });

  it("should keep the backslash that stops a reference definition and drop it from the block beside it", () => {
    expect(roundtrip("see \\[label\\]\n\n\\[label\\]: /url")).toBe(
      "see [label]\n\n\\[label\\]: /url"
    );
  });

  it("should keep an empty numbered item", () => {
    expect(roundtrip("1. foo\n2. ")).toBe("1. foo\n2. ");
  });

  it.each([
    ["a bullet marker", "\\* not a bullet"],
    ["a thematic break", "\\_\\_\\_"],
  ])("should keep the backslash that stops %s", (_name, markdown) => {
    expect(roundtrip(markdown)).toBe(markdown);
  });

  it.each([
    ["angle brackets", "1 < 2 and a > b"],
    ["an arrow", "a -> b"],
    ["ampersands", "AT&T and R&D"],
    ["an angle bracket beside a code span", "`a < b` and a < b"],
    ["an ampersand in a link label", "[Q&A](https://example.com)"],
    ["an angle bracket in a list item", "- a < b"],
    ["an angle bracket beside icon glyphs", " \u{F0000} 1 < 2"],
  ])("should write %s in prose as typed", (_name, markdown) => {
    expect(roundtrip(markdown)).toBe(markdown);
  });

  it.each([
    ["a tag", "&lt;div&gt;"],
    ["an entity", "&amp;nbsp;"],
    ["a blockquote", "&gt; not a quote"],
  ])("should keep the entity that stops %s", (_name, markdown) => {
    expect(roundtrip(markdown)).toBe(markdown);
  });

  it("should drop backslashes from a note that keeps its entities", () => {
    expect(roundtrip("snake\\_case\n\n&lt;div&gt;")).toBe(
      "snake_case\n\n&lt;div&gt;"
    );
  });

  it("should drop entities from a note that keeps its backslashes", () => {
    const markdown = "\\* not a bullet\n\n1 < 2";

    expect(roundtrip("\\* not a bullet\n\n1 &lt; 2")).toBe(markdown);
  });

  it("should keep raw html entities byte for byte beside a bare angle bracket", () => {
    const markdown =
      '<div>Tom &amp; Jerry</div>\n\n<span title="a &lt; b">x</span> and 1 < 2';

    expect(roundtrip(markdown)).toBe(markdown);
  });

  it.each([
    ["table", "- | a |\n  |---|\n  | 1 |"],
    ["codeBlock", "- ```\n  code\n  ```"],
    ["blockquote", "- > quote"],
    ["bulletList", "-\n  - nested"],
  ])("should keep a %s that opens a list item inside it", (type, markdown) => {
    const saved = roundtrip(markdown);
    const reopened = load(saved);
    const item = reopened.state.doc.child(0).child(0);

    expect(item.type.name).toBe("listItem");
    expect(item.child(1).type.name).toBe(type);
    expect(serializeMarkdown(reopened)).toBe(saved);
    reopened.destroy();
  });

  it.each([
    ["codeBlock", "1.\n   ```\n   code\n   ```", "1.\n   ```\n   code\n   ```"],
    ["codeBlock", "1. ```\n   code\n   ```", "1.\n   ```\n   code\n   ```"],
    ["blockquote", "1. > quote", "1.\n   > quote"],
  ])(
    "should keep a %s that opens a numbered item inside it: %j",
    (type, markdown, saved) => {
      const editor = load(markdown);
      const item = editor.state.doc.child(0).child(0);

      expect(item.child(1).type.name).toBe(type);
      expect(serializeMarkdown(editor)).toBe(saved);
      expect(roundtrip(saved)).toBe(saved);
      editor.destroy();
    }
  );

  it.each([
    ["a numbered item", "1. one\n   two"],
    ["a two-digit numbered item", "10. one\n    two"],
    ["a bullet", "- one\n  two"],
    ["a task", "- [ ] one\n  two"],
    ["a hard break in a task", "- [ ] one  \n  two"],
    ["a task nested under a numbered item", "1. a\n   - [ ] b\n     wrapped"],
    ["a loose task list", "- [ ] one\n\n  two\n- [x] three"],
  ])("should keep a wrapped line in %s as typed", (_name, markdown) => {
    expect(roundtrip(markdown)).toBe(markdown);
  });

  it("should keep a list that mixes tasks and bullets in three lists", () => {
    const editor = load("- [ ] a\n- plain\n- [x] c");
    const types = editor.state.doc.content.content.map(
      (node) => node.type.name
    );
    const saved = serializeMarkdown(editor);

    expect(types).toStrictEqual(["taskList", "bulletList", "taskList"]);
    expect(saved).toBe("- [ ] a\n\n- plain\n\n- [x] c");
    expect(roundtrip(saved)).toBe(saved);
    editor.destroy();
  });

  it.each([
    ["nothing after the box", "- [ ]", false],
    ["a checked box alone", "- [x]", true],
    ["a space after the box", "- [ ] ", false],
  ])("should read %s as an empty task", (_name, markdown, checked) => {
    const editor = load(markdown);
    const item = editor.state.doc.child(0).child(0);

    expect(item.type.name).toBe("taskItem");
    expect(item.attrs.checked).toBe(checked);
    expect(item.textContent).toBe("");
    editor.destroy();
  });

  it.each([
    ["a nested list", "- [ ] \n  - nested", "bulletList"],
    ["a paragraph after a blank line", "- [x]\n\n  para", "paragraph"],
  ])("should read an empty task over %s as a task", (_name, markdown, type) => {
    const editor = load(markdown);
    const item = editor.state.doc.child(0).child(0);
    const saved = serializeMarkdown(editor);

    expect(item.type.name).toBe("taskItem");
    expect(item.child(0).textContent).toBe("");
    expect(item.child(1).type.name).toBe(type);
    expect(roundtrip(saved)).toBe(saved);
    editor.destroy();
  });

  it("should keep a checkbox after a number as text", () => {
    const editor = load("1. [ ] x");
    const item = editor.state.doc.child(0).child(0);

    expect(item.type.name).toBe("listItem");
    expect(item.textContent).toBe("[ ] x");
    expect(serializeMarkdown(editor)).toBe("1. [ ] x");
    editor.destroy();
  });

  it("should keep a table after a checkbox as text", () => {
    const markdown = "- [ ] | a |\n  |---|\n  | 1 |";
    const editor = load(markdown);
    const saved = serializeMarkdown(editor);

    expect(editor.state.doc.child(0).child(0).child(0).type.name).toBe(
      "paragraph"
    );
    expect(editor.state.doc.child(0).child(0).childCount).toBe(1);
    expect(saved).toBe(markdown);
    editor.destroy();
  });

  it.each([
    ["an abbreviation", "Mr. Smith went home"],
    ["a lettered list", "a. x\nb. y"],
    ["a roman list", "iv. x\nv. y"],
    ["a word before a period", "vs. the rest"],
  ])("should read %s as prose", (_name, markdown) => {
    const editor = load(markdown);

    expect(editor.state.doc.child(0).type.name).toBe("paragraph");
    expect(serializeMarkdown(editor)).toBe(markdown);
    editor.destroy();
  });

  it("should number items up from the first marker", () => {
    expect(roundtrip("1. a\n1. b\n1. c")).toBe("1. a\n2. b\n3. c");
    expect(roundtrip("3. a\n4. b")).toBe("3. a\n4. b");
  });

  it.each([
    ["a parenthesis list", "1) one\n2) two"],
    ["a wrapped line under a parenthesis", "1) one\n   two"],
    ["a bare parenthesis marker", "1)\n   ```\n   code\n   ```"],
    ["a parenthesis list nested under a period list", "1. a\n   1) b\n2. c"],
    ["a delimiter change that starts a new list", "1. a\n\n1) b"],
  ])("should keep the delimiter of %s", (_name, markdown) => {
    expect(roundtrip(markdown)).toBe(markdown);
  });

  it("should write a table cell's underscore as typed", () => {
    const compact = roundtrip("| a\\_b |\n| --- |\n| c |")
      .replaceAll(/ +/gu, " ")
      .trim();

    expect(compact).toContain("| a_b |");
  });

  it("should decide a block's escapes without a fence line in raw html before it", () => {
    const bare = "<div>\n```\n</div>\n\nsnake_case";

    expect(roundtrip("<div>\n```\n</div>\n\nsnake\\_case")).toBe(bare);
    expect(roundtrip(bare)).toBe(bare);
  });

  it("should parse a dropped attachment whose name has spaces as an image", () => {
    const markdown = attachmentLink(
      "attachments/Screenshot 2026-08-26 at 6.25.40 AM.png",
      "note.md"
    );

    expect(imageSources(markdown)).toStrictEqual([
      "attachments/Screenshot%202026-08-26%20at%206.25.40%20AM.png",
    ]);
    expect(roundtrip(markdown)).toBe(markdown);
  });

  it("should keep an angle-bracket image destination loadable after a save", () => {
    const saved = roundtrip("![a](<attachments/my shot.png>)");

    expect(saved).toBe("![a](attachments/my%20shot.png)");
    expect(imageSources(saved)).toStrictEqual(["attachments/my%20shot.png"]);
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

  it.for([
    {
      markdown:
        '````markdown\n# example\n\n```ts\nconst question = "what changed?";\n```\n````\n\nafter the block\n\n```\nplain code\n```',
      name: "a nested three-backtick fence followed by prose and code",
    },
    {
      markdown:
        "`````markdown\n````markdown\n```ts\nconst a = 1;\n```\n````\n`````\n\nafter the block",
      name: "multiple levels of nested fences",
    },
    {
      markdown: "~~~markdown\n```ts\nconst a = 1;\n```\n~~~\n\nafter the block",
      name: "a tilde fence containing backticks",
    },
    {
      markdown: "````\n```\n\n````\n\nafter the block",
      name: "a plain block ending with a fence and a blank line",
    },
    {
      markdown:
        "> ````markdown\n> ```ts\n> const a = 1;\n> ```\n> ````\n\nafter the quote",
      name: "a nested fence inside a blockquote",
    },
    {
      markdown:
        "- example\n\n  ````markdown\n  ```ts\n  const a = 1;\n  ```\n  ````\n\nafter the list",
      name: "a nested fence inside a list",
    },
    {
      markdown: "```text\n\n```\n\nafter the block",
      name: "an empty labeled block",
    },
  ])(
    "should preserve $name across saves",
    ({ markdown }, { onTestFinished }) => {
      const before = load(markdown);
      onTestFinished(() => {
        before.destroy();
      });
      const saved = serializeMarkdown(before);
      const after = load(saved);
      onTestFinished(() => {
        after.destroy();
      });

      expect(after.getJSON()).toStrictEqual(before.getJSON());
      expect(serializeMarkdown(after)).toBe(saved);
    }
  );

  it("should round-trip tables (cells pad to a canonical width)", () => {
    const markdown = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    const compact = roundtrip(markdown).replaceAll(/ +/gu, " ").trim();

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

  it("should write adjacent tables one blank line apart, the same on every save", () => {
    const once = roundtrip("| a |\n|---|\n| 1 |\n\n| b |\n|---|\n| 2 |");

    expect(once).toBe("| a   |\n| --- |\n| 1   |\n\n| b   |\n| --- |\n| 2   |");
    expect(roundtrip(once)).toBe(once);
  });

  it.each([
    "| a |\n|---|\n| 1 |\n\nprose",
    "- para\n\n  | a |\n  |---|\n  | 1 |\n- next",
    "> | a |\n> |---|\n> | 1 |",
    "> quote\n>\n> | a |\n> |---|\n> | 1 |",
  ])("should keep a table where it sits after one save of %j", (markdown) => {
    const once = roundtrip(markdown);

    expect(once).toContain("| --- |");
    expect(once.startsWith("\n")).toBeFalsy();
    expect(roundtrip(once)).toBe(once);
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

/** A note opened from a file, the way the editor component opens one. */
function open(markdown: string) {
  const editor = load(markdown);

  rememberSources(converterOf(editor), editor.state.doc, markdown);

  return editor;
}

const WRITTEN_ELSEWHERE = [
  ["star bullets", "* one\n* two"],
  ["plus bullets", "+ one\n+ two"],
  ["a loose list", "- one\n\n- two"],
  ["underscore bold", "__bold__ text"],
  ["underscore emphasis", "_em_ text"],
  ["a single-tilde strike", "~gone~"],
  ["a backslash break", "one\\\ntwo"],
  ["a setext heading", "Title\n====="],
  ["a closed heading", "## Title ##"],
  ["a star rule", "***"],
  ["a tilde fence", "~~~js\nx\n~~~"],
  ["a long fence", "````js\nx\n````"],
  ["an unpadded table", "|a|b|\n|-|-|\n|1|2|"],
  ["a table without outer pipes", "a | b\n--- | ---\n1 | 2"],
  ["a four-space nested list", "- one\n    - child"],
  ["a tab-indented nested list", "- one\n\t- child"],
  ["repeated numbering", "1. a\n1. b\n1. c"],
  ["an uppercase task", "- [X] done"],
  ["an autolink", "<https://a.b>"],
  ["a bare url", "see https://a.b now"],
  ["a lazy quote", "> one\ntwo"],
  ["a quote without a space", ">one"],
  ["a heading directly over text", "# h\npara"],
  ["an entity", "a &amp; b"],
  ["an escaped star", "2 \\* 3"],
] as const;

describe("markdown the user did not touch", () => {
  it.each(WRITTEN_ELSEWHERE)(
    "should save %s as written when nothing was edited",
    (_name, markdown) => {
      const editor = open(markdown);

      expect(serializeMarkdown(editor)).toBe(markdown);
      editor.destroy();
    }
  );

  it.each(WRITTEN_ELSEWHERE)(
    "should save %s as written when another block was edited",
    (_name, markdown) => {
      const editor = open(`first\n\n${markdown}\n\nlast\n`);

      editor.commands.insertContentAt(1, "x");

      expect(serializeMarkdown(editor)).toBe(`xfirst\n\n${markdown}\n\nlast\n`);
      editor.destroy();
    }
  );

  it("should keep the blank line that opens a note and the newline that ends it", () => {
    const editor = open("\n# title\n\ntext\n");

    expect(serializeMarkdown(editor)).toBe("\n# title\n\ntext\n");
    editor.destroy();
  });

  it("should keep the newline that ends a note closing on a code block", () => {
    const editor = open("first\n\n```\ncode\n```\n");

    editor.commands.insertContentAt(1, "x");

    expect(serializeMarkdown(editor)).toBe("xfirst\n\n```\ncode\n```\n");
    editor.destroy();
  });

  it("should separate a new block from the ones around it with a blank line", () => {
    const editor = open("# h\npara\n");

    editor.commands.insertContentAt(editor.state.doc.child(0).nodeSize, {
      content: [{ text: "new", type: "text" }],
      type: "paragraph",
    });

    expect(serializeMarkdown(editor)).toBe("# h\n\nnew\n\npara\n");
    editor.destroy();
  });

  it("should write indented code as a fence", () => {
    const editor = open("para\n\n    code\n");

    expect(serializeMarkdown(editor)).toBe("para\n\n```\ncode\n```");
    editor.destroy();
  });

  it("should keep the blocks after a reference link as written", () => {
    const editor = open("[a][r]\n\n* one\n\n[r]: https://a.b\n");

    expect(serializeMarkdown(editor)).toBe("[a](https://a.b)\n\n* one");
    editor.destroy();
  });

  it("should write line feeds for a note that had carriage returns", () => {
    const editor = open("a\r\n\r\n* b\r\n");

    editor.commands.insertContentAt(1, "x");

    expect(serializeMarkdown(editor)).toBe("xa\n\n* b\n");
    editor.destroy();
  });

  it("should write a reference link inline", () => {
    const editor = open("[a][r]\n\n[r]: https://a.b\n");

    expect(serializeMarkdown(editor)).toBe("[a](https://a.b)");
    editor.destroy();
  });
});

describe("an edit in markdown written elsewhere", () => {
  it.each([
    ["star bullets", "* one\n* two\n", 3, "* xone\n* two\n"],
    ["underscore bold", "__bold__ text\n", 2, "__bxold__ text\n"],
    ["a single-tilde strike", "~gone~\n", 2, "~gxone~\n"],
    ["repeated numbering", "1. a\n1. b\n", 3, "1. xa\n1. b\n"],
    [
      "a four-space nested list",
      "- one\n    - child\n",
      3,
      "- xone\n    - child\n",
    ],
    ["a backslash break", "one\\\ntwo\n", 2, "oxne\\\ntwo\n"],
    ["a bare url", "see https://a.b now\n", 2, "sxee https://a.b now\n"],
    ["a heading directly over text", "# h\npara\n", 2, "# hx\npara\n"],
    ["text directly under a heading", "# h\npara\n", 5, "# h\npxara\n"],
    ["the last block of a note", "a\n\nb\n", 5, "a\n\nbx\n"],
  ])(
    "should keep %s as written around the typed text",
    (_name, markdown, position, expected) => {
      const editor = open(markdown);

      editor.commands.insertContentAt(position, "x");

      expect(serializeMarkdown(editor)).toBe(expected);
      editor.destroy();
    }
  );

  it("should keep the spacing in front of a replaced character", () => {
    const editor = open("-   one\n- two\n");

    editor.commands.insertContentAt({ from: 3, to: 4 }, "x");

    expect(serializeMarkdown(editor)).toBe("-   xne\n- two\n");
    editor.destroy();
  });

  it("should keep typing in one block as written across several edits", () => {
    const editor = open("* one\n* two\n");

    editor.commands.insertContentAt(3, "x");
    editor.commands.insertContentAt(4, "y");

    expect(serializeMarkdown(editor)).toBe("* xyone\n* two\n");
    editor.destroy();
  });

  it("should change one character when a task is ticked", () => {
    const editor = open("* [ ] a\n* [ ] b\n");

    editor.commands.command(({ tr }) => {
      tr.setNodeAttribute(1, "checked", true);

      return true;
    });

    expect(serializeMarkdown(editor)).toBe("* [x] a\n* [ ] b\n");
    editor.destroy();
  });

  it("should write the whole list in the serializer's form when an item is added", () => {
    const editor = open("first\n\n* one\n* two\n\n__last__\n");

    editor
      .chain()
      .setTextSelection(20)
      .splitListItem("listItem")
      .insertContent("three")
      .run();

    expect(serializeMarkdown(editor)).toBe(
      "first\n\n- one\n- two\n- three\n\n__last__\n"
    );
    editor.destroy();
  });

  it("should write a table in the serializer's form when a cell changes", () => {
    const editor = open("__first__\n\n|a|b|\n|-|-|\n|1|2|\n");

    editor.commands.insertContentAt(editor.state.doc.content.size - 4, "x");

    expect(serializeMarkdown(editor)).toBe(
      "__first__\n\n| a   | b   |\n| --- | --- |\n| 1   | 2x  |\n\n"
    );
    editor.destroy();
  });

  it("should put a blank line under a heading that becomes text", () => {
    const editor = open("# h\npara\n");

    editor.chain().setTextSelection(2).setParagraph().run();

    expect(serializeMarkdown(editor)).toBe("h\n\npara\n");
    editor.destroy();
  });

  it("should keep a backslash the file had and write a typed character bare", () => {
    const editor = open(
      "the snake\\_case name\n\n![notes \\].png](notes.png)\n"
    );

    editor.commands.insertContentAt(2, "_");

    expect(serializeMarkdown(editor)).toBe(
      "t_he snake\\_case name\n\n![notes \\].png](notes.png)\n"
    );
    editor.destroy();
  });
});
