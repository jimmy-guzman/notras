import { Editor } from "@tiptap/core";
import { Marked } from "marked";
import { describe, expect, it } from "vitest";

import { createEditorExtensions } from "./extensions";
import { createNoteMarked } from "./marked-blocks";

const startCallbacks = (editor: Editor) =>
  editor.markdown?.instance.defaults.extensions?.startBlock?.length;

describe(createNoteMarked, () => {
  it.each([
    ["a horizontal rule", "before\n\n---\n\nafter"],
    ["a rule that is too short", "before\n\n--\n\nafter"],
    ["a blockquote", "> quoted\n> more\n\nplain"],
    ["a quote marker inside a fence", "```\n> not a quote\n```\n\n> quote"],
    ["a block of html", "<div>\nraw\n</div>\n\ntext"],
    ["an unclosed tag", "<div\nstill text"],
    ["a setext heading", "Title\n===\n\nBody\n---\n\nplain"],
    ["a table", "| a | b |\n| - | - |\n| 1 | 2 |\n\ntext"],
    ["a pipe row with no delimiter", "a | b\nc | d\n\ntext"],
    [
      "plain paragraphs",
      Array.from(
        { length: 40 },
        (_, index) => `Paragraph ${index} carries plain words.`
      ).join("\n\n"),
    ],
  ])("should tokenize %s exactly as marked does", (_, markdown) => {
    expect(createNoteMarked().lexer(markdown)).toStrictEqual(
      new Marked({ gfm: true }).lexer(markdown)
    );
  });

  it("should keep a repeated definition and resolve the label to the first", () => {
    const markdown = "[a][r]\n\n[r]: https://first.b\n\n[r]: https://second.b";
    const marked = createNoteMarked();

    expect(
      marked
        .lexer(markdown)
        .filter((token) => token.type === "def")
        .map((token) => token.raw.trim())
    ).toStrictEqual(["[r]: https://first.b", "[r]: https://second.b"]);
    expect(marked.parse(markdown)).toContain('href="https://first.b"');
  });

  it("should give each editor a parser that other editors do not grow", () => {
    const first = new Editor({ extensions: createEditorExtensions({}) });
    const registered = startCallbacks(first);

    const second = new Editor({ extensions: createEditorExtensions({}) });

    expect(registered).toBeGreaterThan(0);
    expect(startCallbacks(first)).toBe(registered);
    expect(startCallbacks(second)).toBe(registered);

    first.destroy();
    second.destroy();
  });
});
