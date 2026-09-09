import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorExtensions } from "@/components/editor/extensions";
import { createFindHandle, Find } from "@/components/editor/find";
import { createFindController } from "./find";

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
  return { editor, handle: createFindHandle(editor) };
}

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
    expect(controller.store.state.open).toBe(true);
    detachSecond();
    controller.navigate(1);
    expect(controller.store.state.available).toBe(false);
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
    expect(controller.store.state.open).toBe(false);
    expect(controller.store.state.query).toBe("Atlas");
    expect(capture.store.state.query).toBe("");
  });
  it("should stop exposing a destroyed editor", () => {
    const { editor, handle } = mount("Atlas");
    const controller = createFindController();
    controller.bind(handle);
    controller.open();
    editor.destroy();
    controller.navigate(1);
    expect(controller.store.state.available).toBe(false);
  });
});
