import { Editor } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";
import { describe, expect, it } from "vitest";

import { createEditorExtensions } from "./extensions";

/** The app's stack with the wrapped table swapped back for upstream's. */
const upstreamExtensions = () =>
  createEditorExtensions({}).map((extension) =>
    extension.name === "table"
      ? Table.configure({ resizable: false })
      : extension
  );

const parse = (markdown: string, extensions = createEditorExtensions({})) => {
  const editor = new Editor({
    content: markdown,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions,
  });
  const json = editor.getJSON();

  editor.destroy();

  return json;
};

describe("bounded table tokenizer", () => {
  it.each([
    "| a | b |\n|---|---|\n| 1 | 2 |\nprose with no blank line",
    "| a |\n|---|\n| 1 |\n\n| b\n|--|\n\n|no separator|\nprose\n\n|--|\n|--|",
    "| a | b |\n|---|---|\n| 1 | 2 |\n# heading\n| c |\n|---|\n| 3 |\n> quote",
    "| a | b |\n|---|---|\n| 1 | 2 |\n- item\n\n| c | `d|e` |\n|---|---|\n| 3 | 4 |",
    "| a |\n|---|\n| 1 |\n\n\n\n| b |\n|---|",
  ])("should parse %j the way upstream does", (markdown) => {
    expect(parse(markdown)).toStrictEqual(
      parse(markdown, upstreamExtensions())
    );
  });
});
