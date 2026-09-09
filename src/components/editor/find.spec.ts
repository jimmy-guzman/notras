import { Editor } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorExtensions } from "@/components/editor/extensions";
import { createFindHandle, Find } from "./find";

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors) {
    editor.destroy();
  }
  editors.length = 0;
});

function mount(content: string) {
  const editor = new Editor({
    content,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: [...createEditorExtensions({}), Find],
  });
  editors.push(editor);
  return { editor, find: createFindHandle(editor) };
}

describe("find in rich text", () => {
  it("should find literal text across formatting and link labels within a block", () => {
    const { editor, find } = mount(
      "Ada **Love**lace and [Ada Lovelace](a.md).\n\nAda\n\nLovelace"
    );
    find.setQuery("ada lovelace");
    expect(find.snapshot()).toEqual({ current: 1, total: 2 });
    expect(
      editor.view.dom.querySelectorAll(".note-find-match").length
    ).toBeGreaterThan(1);
    find.restoreFocus();
    expect(find.selectionText()).toBe("Ada Lovelace");
  });
  it("should map a wikilink title to the atomic node and match adjacent prose", () => {
    const { editor, find } = mount("visit [[Atlas]] today");
    find.setQuery("atlas");
    expect(find.snapshot()).toEqual({ current: 1, total: 1 });
    expect(
      editor.view.dom
        .querySelector('[data-wikilink="Atlas"]')
        ?.classList.contains("note-find-active")
    ).toBe(true);
    find.restoreFocus();
    expect(find.selectionText()).toBe("Atlas");
    find.setQuery("visit atlas today");
    expect(find.snapshot().total).toBe(1);
  });
  it("should search code and table cells but not join separate cells", () => {
    const { find } = mount(
      "```ts\nconst atlas = 1;\n```\n\n| a | b |\n| - | - |\n| Atlas | atlas |"
    );
    find.setQuery("atlas");
    expect(find.snapshot().total).toBe(3);
    find.setQuery("Atlas atlas");
    expect(find.snapshot().total).toBe(0);
  });
  it("should wrap and match literal non-overlapping text", () => {
    const { find } = mount("aaa a.a A.A");
    find.setQuery("aa");
    expect(find.snapshot()).toEqual({ current: 1, total: 1 });
    find.setQuery("a.a");
    expect(find.snapshot()).toEqual({ current: 1, total: 2 });
    find.navigate(-1);
    expect(find.snapshot().current).toBe(2);
    find.navigate(1);
    expect(find.snapshot().current).toBe(1);
  });
  it("should preserve content and undo while updating matches after edits and undo", () => {
    const { editor, find } = mount("Atlas");
    editor.commands.setTextSelection(6);
    editor.commands.insertContent(" Atlas");
    const content = editor.getJSON();
    const depth = undoDepth(editor.state);
    find.setQuery("atlas");
    find.navigate(1);
    find.restoreFocus();
    expect(editor.getJSON()).toEqual(content);
    expect(undoDepth(editor.state)).toBe(depth);
    editor.commands.undo();
    expect(find.snapshot().total).toBe(1);
    editor.commands.redo();
    expect(find.snapshot().total).toBe(2);
    find.setQuery(null);
    expect(editor.view.dom.querySelector(".note-find-match")).toBeNull();
    expect(editor.getJSON()).toEqual(content);
  });
  it("should restore the previous caret when nothing matches", () => {
    const { editor, find } = mount("Atlas");
    editor.commands.setTextSelection(3);
    find.setQuery("missing");
    find.restoreFocus();
    expect(editor.state.selection.from).toBe(3);
    expect(find.snapshot()).toEqual({ current: 0, total: 0 });
  });
  it("should stop receiving navigation after destruction", () => {
    const { editor, find } = mount("Atlas Atlas");
    find.setQuery("atlas");
    editor.destroy();
    find.navigate(1);
    find.setQuery("other");
    find.restoreFocus();
    expect(find.alive()).toBe(false);
    expect(find.snapshot().total).toBe(0);
  });
});
