import { Editor } from "@tiptap/core";
import { describe, expect, it, onTestFinished } from "vitest";

import { createEditorExtensions } from "./extensions";
import { headingAnchors } from "./heading-anchors";

describe(headingAnchors, () => {
  it.each([
    [
      "# Hello, world!\n\n## Hello, world!\n\n### Hello, world!",
      ["hello-world", "hello-world-1", "hello-world-2"],
    ],
    [
      "# Foo\n\n# Foo-1\n\n# Foo\n\n# Foo-1",
      ["foo", "foo-1", "foo-2", "foo-1-1"],
    ],
    [
      "# Привет non-latin 你好\n\n## Déjà Vu\n\n## 😄 emoji",
      ["привет-non-latin-你好", "déjà-vu", "-emoji"],
    ],
    ["# a_b -- c\n\n# a  b\n\n# !!!\n\n# !!!", ["a_b----c", "a--b", "-1"]],
    [
      "# **Strong** `code` [label](https://example.com) ![alt](shot.png) [[Note]]",
      ["strong-code-label-alt-note"],
    ],
    [
      "not a heading\n\n```markdown\n# code heading\n```\n\n> ## Quoted heading",
      ["quoted-heading"],
    ],
  ])(
    "should assign GitHub anchors to rendered headings: %s",
    (content, expected) => {
      const editor = new Editor({
        content,
        contentType: "markdown",
        extensions: createEditorExtensions({}),
      });
      onTestFinished(() => {
        editor.destroy();
      });

      const anchors = headingAnchors(editor.state.doc.content);
      expect([...anchors.keys()]).toStrictEqual(expected);
      for (const position of anchors.values()) {
        expect(editor.state.doc.resolve(position).parent.type.name).toBe(
          "heading"
        );
        expect(editor.state.doc.resolve(position).parentOffset).toBe(0);
      }
      expect([
        ...headingAnchors(editor.state.doc.content).keys(),
      ]).toStrictEqual(expected);
    }
  );
});
