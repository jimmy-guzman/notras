import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createEditorExtensions } from "@/components/editor/extensions";

const editors: Editor[] = [];
function mount(content: string) {
  const editor = new Editor({
    content,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });
  editors.push(editor);
  return editor;
}

const highlighted = (editor: Editor) =>
  Array.from(
    editor.view.dom.querySelectorAll(".selected-text"),
    (element) => element.textContent
  );

describe("selection highlight", () => {
  afterEach(() => {
    for (const editor of editors) {
      editor.destroy();
    }
    editors.length = 0;
  });

  it("should mark the text of every block after select all", () => {
    const editor = mount("# title\n\n- [ ] task\n\n1. item");

    editor.commands.selectAll();

    expect(highlighted(editor)).toStrictEqual(["title", "task", "item"]);
  });

  it("should mark only the selected words", () => {
    const editor = mount("one two three");

    editor.commands.setTextSelection({ from: 5, to: 8 });

    expect(highlighted(editor)).toStrictEqual(["two"]);
  });

  it("should mark nothing for a caret", () => {
    const editor = mount("one two three");

    editor.commands.setTextSelection(5);

    expect(highlighted(editor)).toStrictEqual([]);
  });

  it("should leave a selected image to its node style", () => {
    const editor = mount("![alt](a.png)");

    editor.commands.setNodeSelection(1);

    expect(highlighted(editor)).toStrictEqual([]);
    expect(
      editor.view.dom.querySelector(".ProseMirror-selectednode img")
    ).not.toBeNull();
  });
});
