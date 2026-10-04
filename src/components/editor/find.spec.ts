import { Editor } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { createEditorExtensions } from "@/components/editor/extensions";

import { createFindHandle, Find } from "./find";

const editors: Editor[] = [];
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

describe("find", () => {
  afterEach(() => {
    for (const editor of editors) {
      editor.destroy();
    }
    editors.length = 0;
  });

  describe("find in rich text", () => {
    it("should find literal text across formatting and link labels within a block", () => {
      const { editor, find } = mount(
        "Ada **Love**lace and [Ada Lovelace](a.md).\n\nAda\n\nLovelace"
      );
      find.setQuery("ada lovelace");
      expect(find.snapshot()).toStrictEqual({ current: 1, total: 2 });
      expect(
        editor.view.dom.querySelectorAll(".note-find-match").length
      ).toBeGreaterThan(1);
      find.restoreFocus();
      expect(find.selectionText()).toBe("Ada Lovelace");
    });

    it("should map a wikilink title to the atomic node and match adjacent prose", () => {
      const { editor, find } = mount("visit [[Atlas]] today");
      find.setQuery("atlas");
      expect(find.snapshot()).toStrictEqual({ current: 1, total: 1 });
      expect(
        editor.view.dom
          .querySelector('[data-wikilink="Atlas"]')
          ?.classList.contains("note-find-active")
      ).toBeTruthy();
      find.restoreFocus();
      expect(find.selectionText()).toBe("Atlas");
      find.setQuery("visit atlas today");
      expect(find.snapshot().total).toBe(1);
    });

    it("should keep prose matches aligned after a wikilink title with an astral character", () => {
      const { find } = mount("visit [[🙂 Atlas]] today");
      find.setQuery("today");
      expect(find.snapshot()).toStrictEqual({ current: 1, total: 1 });
      find.restoreFocus();
      expect(find.selectionText()).toBe("today");
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
      expect(find.snapshot()).toStrictEqual({ current: 1, total: 1 });
      find.setQuery("a.a");
      expect(find.snapshot()).toStrictEqual({ current: 1, total: 2 });
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
      const depth = Number(undoDepth(editor.state));
      find.setQuery("atlas");
      find.navigate(1);
      find.restoreFocus();
      expect(editor.getJSON()).toStrictEqual(content);
      expect(undoDepth(editor.state)).toBe(depth);
      editor.commands.undo();
      expect(find.snapshot().total).toBe(1);
      editor.commands.redo();
      expect(find.snapshot().total).toBe(2);
      find.setQuery(null);
      expect(editor.view.dom.querySelector(".note-find-match")).toBeNull();
      expect(editor.getJSON()).toStrictEqual(content);
    });

    it("should restore the previous caret when nothing matches", () => {
      const { editor, find } = mount("Atlas");
      editor.commands.setTextSelection(3);
      find.setQuery("missing");
      find.restoreFocus();
      expect(editor.state.selection.from).toBe(3);
      expect(find.snapshot()).toStrictEqual({ current: 0, total: 0 });
    });

    it("should center an off-screen match below the find bar and leave a visible one in place", () => {
      const viewport = document.createElement("div");
      viewport.dataset.slot = "scroll-area-viewport";
      const editor = new Editor({
        content: "Atlas",
        contentType: "markdown",
        element: viewport,
        extensions: [...createEditorExtensions({}), Find],
      });
      editors.push(editor);
      Object.defineProperty(viewport, "getBoundingClientRect", {
        value: () => ({ bottom: 616, top: 0 }),
      });
      let matchTop = 1000;
      Object.defineProperty(editor.view, "coordsAtPos", {
        value: () => ({ bottom: matchTop + 20, top: matchTop }),
      });
      const find = createFindHandle(editor);

      find.setQuery("atlas");
      // Opening find adds 52px of room above the text and scrolls past it.
      expect(viewport.scrollTop).toBe(52 + 684);

      find.setQuery(null);
      viewport.scrollTop = 0;
      matchTop = 300;
      find.setQuery("atlas");
      expect(viewport.scrollTop).toBe(52);
    });

    it("should highlight the matches on screen and the active one while counting every match", () => {
      const viewport = document.createElement("div");
      viewport.dataset.slot = "scroll-area-viewport";
      const editor = new Editor({
        content: `atlas\n\natlas\n\n${"x".repeat(600)}\n\natlas`,
        contentType: "markdown",
        element: viewport,
        extensions: [...createEditorExtensions({}), Find],
      });
      editors.push(editor);
      Object.defineProperty(viewport, "getBoundingClientRect", {
        value: () => ({ bottom: 600, top: 0 }),
      });
      Object.defineProperty(editor.view.dom, "getBoundingClientRect", {
        value: () => ({ bottom: 2000, left: 0, top: 0, width: 600 }),
      });
      // The screen ends inside the second paragraph, and the last one sits
      // past the margin kept around it.
      Object.defineProperty(editor.view, "posAtCoords", {
        value: ({ top }: { top: number }) => ({ pos: top < 300 ? 0 : 9 }),
      });
      Object.defineProperty(editor.view, "coordsAtPos", {
        value: () => ({ bottom: 120, top: 100 }),
      });
      const find = createFindHandle(editor);

      find.setQuery("atlas");

      expect(find.snapshot()).toStrictEqual({ current: 1, total: 3 });
      expect(editor.view.dom.querySelectorAll(".note-find-match")).toHaveLength(
        2
      );

      find.navigate(-1);

      expect(find.snapshot()).toStrictEqual({ current: 3, total: 3 });
      expect(
        editor.view.dom.querySelector("p:last-child .note-find-active")
      ).not.toBeNull();
    });

    it("should highlight the matches a scroll brings on screen", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const viewport = document.createElement("div");
      viewport.dataset.slot = "scroll-area-viewport";
      document.body.append(viewport);
      const editor = new Editor({
        content: `atlas\n\natlas\n\n${"x".repeat(600)}\n\natlas`,
        contentType: "markdown",
        element: viewport,
        extensions: [...createEditorExtensions({}), Find],
      });
      editors.push(editor);
      Object.defineProperty(viewport, "getBoundingClientRect", {
        value: () => ({ bottom: 600, top: 0 }),
      });
      Object.defineProperty(editor.view.dom, "getBoundingClientRect", {
        value: () => ({ bottom: 2000, left: 0, top: 0, width: 600 }),
      });
      let screenEnd = 9;
      Object.defineProperty(editor.view, "posAtCoords", {
        value: ({ top }: { top: number }) => ({
          pos: top < 300 ? 0 : screenEnd,
        }),
      });
      Object.defineProperty(editor.view, "coordsAtPos", {
        value: () => ({ bottom: 120, top: 100 }),
      });
      createFindHandle(editor).setQuery("atlas");

      screenEnd = 620;
      viewport.dispatchEvent(new Event("scroll"));
      vi.advanceTimersToNextFrame();

      expect(editor.view.dom.querySelectorAll(".note-find-match")).toHaveLength(
        3
      );
      viewport.remove();
    });

    it("should stop receiving navigation after destruction", () => {
      const { editor, find } = mount("Atlas Atlas");
      find.setQuery("atlas");
      editor.destroy();
      find.navigate(1);
      find.setQuery("other");
      find.restoreFocus();
      expect(find.alive()).toBeFalsy();
      expect(find.snapshot().total).toBe(0);
    });
  });
});
