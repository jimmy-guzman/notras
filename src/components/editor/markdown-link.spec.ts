import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { isNotePath } from "@/core/links";

import { createEditorExtensions } from "./extensions";

/**
 * The markdown-link parity table. `finds_the_markdown_note_links_the_editor_renders`
 * in `src-tauri/src/index.rs` asserts the same cases in the same order, so what
 * the index records and what the editor opens on ⌘-click can be diffed by eye.
 */
const cases: [markdown: string, targets: string[]][] = [
  ["[a](b.md)", ["b.md"]],
  ["[a](./b.md)", ["./b.md"]],
  ["[a](../b.md)", ["../b.md"]],
  ["[a](B.MD)", ["B.MD"]],
  ["[a](b.md#h)", ["b.md#h"]],
  ["[a](sub/b%20c.md)", ["sub/b%20c.md"]],
  ['[a](b.md "title")', ["b.md"]],
  ["[a](b.md 'single')", ["b.md"]],
  ["[a](<b c.md>)", ["b c.md"]],
  ["[a](  b.md  )", ["b.md"]],
  ["[a](b\\(1\\).md)", ["b(1).md"]],
  ["[a][r]\n\n[r]: b.md", ["b.md"]],
  ["[b.md][]\n\n[b.md]: b.md", ["b.md"]],
  // A URL, an anchor, an absolute path, or another kind of file is not a note.
  ["<http://x>", []],
  ["[a](http://x/b.md)", []],
  ["[a](file:///x/b.md)", []],
  ["[a](mailto:x@y.z)", []],
  ["[a](#h)", []],
  ["[a](/abs/b.md)", []],
  ["[a](b.txt)", []],
  ["[a](b.md.txt)", []],
  ["[a](.md)", []],
  // The extension is the last one, and case does not matter.
  ["[a](b.MD.md)", ["b.MD.md"]],
  ["[a](b.markdown)", ["b.markdown"]],
  ["[a](b.md?x=1)", ["b.md?x=1"]],
  ["[a](b.md#^block)", ["b.md#^block"]],
  ["[a](b.md#h?x)", ["b.md#h?x"]],
  ["[a](notes/../b.md)", ["notes/../b.md"]],
  // Where the editor renders no link, the index records none.
  ["![i](b.md)", []],
  ["```\n[a](b.md)\n```", []],
  ["`[a](b.md)`", []],
  ["<span>[a](b.md)</span>", []],
  // Inline containers.
  ["# [a](b.md)", ["b.md"]],
  ["- [a](b.md)", ["b.md"]],
  ["[**a**](b.md)", ["b.md"]],
  ["[a](b.md) and [c](b.md)", ["b.md", "b.md"]],
  ["[a](b.md)[c](d.md)", ["b.md", "d.md"]],
  ['[a](b.md "t") x [[b]]', ["b.md"]],
];

/** The destination of every note link a markdown string parses into, in order. */
function noteLinks(markdown: string) {
  const editor = new Editor({
    content: markdown,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });
  const hrefs: string[] = [];

  editor.state.doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.type.name === "link" && typeof mark.attrs.href === "string") {
        hrefs.push(mark.attrs.href);
      }
    }

    return true;
  });

  editor.destroy();

  return hrefs.filter(isNotePath);
}

describe("markdown link", () => {
  it.each(cases)(
    "should open the same note link the index records in %j",
    (markdown, expected) => {
      expect(noteLinks(markdown)).toEqual(expected);
    }
  );
});
