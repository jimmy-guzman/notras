import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createEditorExtensions } from "./extensions";

/**
 * The wikilink parity table. `finds_the_wikilinks_the_editor_renders` in
 * `src-tauri/src/index.rs` asserts the same cases in the same order, so what
 * the editor renders as a pill and what the index records can be diffed by
 * eye. A case missing here is a case nothing checks.
 */
const cases: [markdown: string, targets: string[]][] = [
  ["see [[a]] here", ["a"]],
  ["[[a]] and [[b]]", ["a", "b"]],
  ["[[a]] [[a]]", ["a", "a"]],
  ["[[a]]\nnext line [[b]]", ["a", "b"]],
  ["[[a]]\n\n[[b]]", ["a", "b"]],
  ["a [[b]]  \nc", ["b"]],
  // The target is the text between the brackets, as written.
  ["[[a|alias]]", ["a|alias"]],
  ["[[a#h]]", ["a#h"]],
  ["[[ spaced ]]", [" spaced "]],
  ["[[**a**]]", ["**a**"]],
  ["[[a\\]]", ["a\\"]],
  // An embed reads as a wikilink behind a `!` until transclusion lands.
  ["![[a]]", ["a"]],
  // A bracket inside the target, or nothing inside, opens no link.
  ["[[a]b]]", []],
  ["[[[a]]]", ["a"]],
  ["[[a]]]", ["a"]],
  ["[[]]", []],
  // A bracket behind an odd run of backslashes is text.
  ["a\\[[b]]", []],
  ["\\\\[[a]]", ["a"]],
  ["# see [[a]]", ["a"]],
  ["> [[a]]", ["a"]],
  ["| [[a]] |\n| --- |\n| x |", ["a"]],
  ["1. [[a]]", ["a"]],
  ["- [ ] [[a]]", ["a"]],
  ["- [[a]]\n  - [[b]]", ["a", "b"]],
  ["**[[a]]**", ["a"]],
  ["*[[a]]*", ["a"]],
  ["[see [[a]]](http://x)", ["a"]],
  ["[see [[**a**]]](x)", ["**a**"]],
  ["![see [[a]]](x)", ["a"]],
  // A link destination is not prose.
  ["[t]([[a]])", []],
  ["[x]: http://y\n[[a]]", ["a"]],
  ["`[[a]]`", []],
  ["`` ` [[a]] ``", []],
  ["` unclosed [[a]]", ["a"]],
  ["`` [[a]] `", ["a"]],
  ["text `code` [[a]] `more`", ["a"]],
  ["[[a]] `[[b]]`", ["a"]],
  ["`[[a]]` and [[b]]", ["b"]],
  ["```\n[[a]]\n```", []],
  ["~~~\n[[a]]\n~~~", []],
  ["```js\n[[a]]\n```\n[[b]]", ["b"]],
  ["````\n```\n[[a]]\n```\n````", []],
  ["~~~\n```\n[[a]]\n~~~", []],
  ["```\n[[a]]\n````", []],
  ["   ```\n[[a]]\n   ```", []],
  ["```\n[[a]]", []],
  ["[[a]]\n```\n[[b]]\n```", ["a"]],
  ["``` [[a]]\n```", []],
  // Backticks in the info string make it a paragraph, not a fence.
  ["```inline``` [[a]]", ["a"]],
  ["> ```\n> [[a]]\n> ```", []],
  ["- ```\n  [[a]]\n  ```", []],
  // Indented code, which CommonMark measures from the container.
  ["    [[a]]", []],
  ["\t[[a]]", []],
  ["para\n\n    [[a]]", []],
  ["para\n    [[a]]", ["a"]],
  ["- item\n    [[a]]", ["a"]],
  ["- item\n\n      [[a]]", []],
  // HTML blocks and comments are opaque.
  ["<!-- [[a]] -->", []],
  ["[[a]]<!-- [[b]] -->", ["a"]],
  ["<div>[[a]]</div>", []],
  ["line\n<div>\n[[a]]\n</div>", []],
  ["<span>\n[[a]]\n</span>", []],
  // A matching pair of inline tags hides what sits between them.
  ["<span>[[a]]</span>", []],
  ["x <span>[[a]]</span> y", []],
  ["<span>y</span> [[a]]", ["a"]],
  ["[[a]] <span>y</span>", ["a"]],
  ["<span>x</span>[[a]]<span>y</span>", ["a"]],
  ["<b>[[a]]</b> [[c]]", ["c"]],
  ["<span>x [[a]]</span> [[b]] <i>[[c]]</i>", ["b"]],
  ["<span>[[a]] <b>x</b></span>", []],
  ['<span title="[[a]]">x</span>', []],
  // An unmatched tag hides only itself.
  ["<span>[[a]]", ["a"]],
  ["[[a]]</span>", ["a"]],
  ["a <br> [[b]]", ["b"]],
  ["<kbd>k</kbd> [[a]]", ["a"]],
  ["<em>x</em>[[a]]", ["a"]],
];

/** The target of every wikilink pill a markdown string parses into, in order. */
function wikilinkTargets(markdown: string) {
  const editor = new Editor({
    content: markdown,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });
  const targets: string[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === "wikilink") {
      targets.push(String(node.attrs.title));
    }

    return true;
  });

  editor.destroy();

  return targets;
}

describe("wikilink", () => {
  it.each(cases)(
    "should render a pill where the index records a link in %j",
    (markdown, expected) => {
      expect(wikilinkTargets(markdown)).toEqual(expected);
    }
  );
});
