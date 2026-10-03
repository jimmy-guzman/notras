import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createEditorExtensions } from "@/components/editor/extensions";
import { createFindHandle, Find } from "@/components/editor/find";

import { createFindController } from "./find";

const editors: Editor[] = [];
function mount(content: string) {
  const editor = new Editor({
    content,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: [...createEditorExtensions({}), Find],
  });
  editors.push(editor);
  return { editor, handle: createFindHandle(editor) };
}

describe("find", () => {
  afterEach(() => {
    for (const editor of editors) {
      editor.destroy();
    }
    editors.length = 0;
  });
  describe("window find controller", () => {
    it("should seed single-line selections and retain the query across editor handoff", () => {
      const first = mount("Atlas Atlas");
      const second = mount("Atlas Atlas Atlas");
      first.editor.commands.setTextSelection({ from: 1, to: 6 });
      const controller = createFindController();
      const detachFirst = controller.bind(first.handle);
      controller.open();
      expect(controller.store.state.query).toBe("Atlas");
      expect(controller.store.state.total).toBe(2);
      const detachSecond = controller.bind(second.handle);
      detachFirst();
      controller.navigate(1);
      expect(controller.store.state.current).toBe(2);
      expect(controller.store.state.total).toBe(3);
      expect(first.handle.snapshot().total).toBe(0);
      expect(controller.store.state.open).toBeTruthy();
      detachSecond();
      controller.navigate(1);
      expect(controller.store.state.available).toBeFalsy();
      expect(second.handle.snapshot().total).toBe(0);
    });

    it("should reuse the window query for multiline selections and isolate capture", () => {
      const { editor, handle } = mount("Atlas\n\nAtlas");
      const controller = createFindController();
      const capture = createFindController();
      controller.bind(handle);
      controller.setQuery("Atlas");
      editor.commands.selectAll();
      controller.open();
      expect(controller.store.state.query).toBe("Atlas");
      controller.close();
      expect(controller.store.state.open).toBeFalsy();
      expect(controller.store.state.query).toBe("Atlas");
      expect(capture.store.state.query).toBe("");
    });

    it("should search a given word and put a collapsed caret on its next match", () => {
      const { editor, handle } = mount("Plan Atlas then Atlas");
      const controller = createFindController();
      controller.bind(handle, "tab");
      editor.commands.setTextSelection({ from: 1, to: 5 });
      controller.search("Atlas", "tab");
      expect(controller.store.state.open).toBeTruthy();
      expect(controller.store.state.query).toBe("Atlas");
      expect(controller.store.state.current).toBe(1);
      expect(controller.store.state.total).toBe(2);
      expect(editor.state.selection.empty).toBeTruthy();
      expect(editor.state.selection.from).toBe(6);
      expect(controller.store.state.focusRequest).toBe(0);
    });

    it("should leave the bound editor alone and give the caret to the next one", () => {
      const showing = mount("Atlas here");
      const next = mount("First, then Atlas");
      const controller = createFindController();
      const detach = controller.bind(showing.handle, "showing");
      controller.search("Atlas", "next");
      expect(showing.handle.snapshot().total).toBe(0);
      expect(showing.editor.state.selection.from).toBe(1);
      detach();
      controller.bind(next.handle, "next");
      expect(controller.store.state.total).toBe(1);
      expect(next.editor.state.selection.from).toBe(13);
      expect(controller.store.state.focusRequest).toBe(0);
    });

    it("should end a search's find when another tab's editor binds", () => {
      const found = mount("An Atlas entry");
      const other = mount("Atlas elsewhere");
      const controller = createFindController();
      const detach = controller.bind(found.handle, "found");
      controller.search("Atlas", "found");
      detach();
      const detachOther = controller.bind(other.handle, "other");
      expect(controller.store.state.open).toBeFalsy();
      expect(other.handle.snapshot().total).toBe(0);
      detachOther();
      controller.bind(found.handle, "found");
      expect(controller.store.state.open).toBeFalsy();
    });

    it("should keep a search's find across tabs once it is stepped through", () => {
      const found = mount("An Atlas entry");
      const other = mount("Atlas elsewhere");
      const controller = createFindController();
      const detach = controller.bind(found.handle, "found");
      controller.search("Atlas", "found");
      controller.navigate(1);
      detach();
      controller.bind(other.handle, "other");
      expect(controller.store.state.open).toBeTruthy();
      expect(other.handle.snapshot().total).toBe(1);
    });

    it("should stop exposing a destroyed editor", () => {
      const { editor, handle } = mount("Atlas");
      const controller = createFindController();
      controller.bind(handle);
      controller.open();
      editor.destroy();
      controller.navigate(1);
      expect(controller.store.state.available).toBeFalsy();
    });
  });
});
