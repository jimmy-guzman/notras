import { detectPlatform } from "@tanstack/react-hotkeys";
import { Editor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CaptureWindow } from "@/components/capture-window";
import { createEditorExtensions } from "@/components/editor/extensions";
import { createFindHandle, Find } from "@/components/editor/find";
import {
  SourceEditor,
  type SourceEditorHandle,
} from "@/components/editor/source-editor";
import { createFindController } from "@/lib/ui/find";
import { FindBar } from "./find-bar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function key(
  element: Element,
  name: string,
  modifiers: KeyboardEventInit = {}
) {
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: name,
      ...modifiers,
    })
  );
}

describe("find controls", () => {
  it("should navigate from the input and editor and consume Escape before capture saves", async ({
    onTestFinished,
  }) => {
    const host = document.createElement("div");
    const surface = document.createElement("div");
    document.body.append(host, surface);
    const editor = new Editor({
      content: "Atlas Atlas",
      contentType: "markdown",
      element: surface,
      extensions: [...createEditorExtensions({}), Find],
    });
    const controller = createFindController();
    controller.bind(createFindHandle(editor));
    controller.setQuery("atlas");
    const root = createRoot(host);
    let escaped = 0;
    const captureSave = () => {
      escaped += 1;
    };
    document.addEventListener("keydown", captureSave);
    onTestFinished(() => {
      document.removeEventListener("keydown", captureSave);
      act(() => root.unmount());
      editor.destroy();
      host.remove();
      surface.remove();
    });
    await act(async () => {
      root.render(createElement(FindBar, { controller }));
      controller.open();
      await Promise.resolve();
    });
    const input = host.querySelector("input");
    if (input === null) {
      throw new Error("find input missing");
    }
    expect(document.activeElement).toBe(input);
    expect(host.textContent).toContain("1 / 2");
    act(() => key(input, "Enter"));
    expect(host.textContent).toContain("2 / 2");
    act(() => key(input, "Enter", { shiftKey: true }));
    expect(host.textContent).toContain("1 / 2");
    act(() => key(editor.view.dom, "g", { metaKey: true, shiftKey: true }));
    expect(host.textContent).toContain("2 / 2");
    act(() => key(input, "Escape"));
    expect(host.querySelector("input")).toBeNull();
    expect(escaped).toBe(0);
    expect(editor.state.doc.textContent).toBe("Atlas Atlas");
    expect(document.activeElement).toBe(editor.view.dom);
    expect(editor.view.dom.querySelector(".note-find-match")).toBeNull();
    act(() => key(editor.view.dom, "g", { metaKey: true }));
    expect(host.querySelector("input")).not.toBeNull();
    expect(host.textContent).toContain("1 / 2");
    act(() => key(editor.view.dom, "g", { altKey: true, metaKey: true }));
    expect(host.textContent).toContain("1 / 2");
  });

  it("should search raw source including frontmatter and update without changing it", async ({
    onTestFinished,
  }) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const handles: SourceEditorHandle[] = [];
    const changes: string[] = [];
    const source = "---\ntitle: Atlas\n---\n# Atlas\n\n`Atlas`";
    onTestFinished(() => {
      act(() => root.unmount());
      host.remove();
    });
    await act(async () => {
      root.render(
        createElement(SourceEditor, {
          initialValue: source,
          onChange: (value) => changes.push(value),
          onReady: (ready) => handles.push(ready),
        })
      );
      await Promise.resolve();
    });
    await act(async () => {
      await vi.waitFor(() => expect(handles).toHaveLength(1));
    });
    const [handle] = handles;
    if (handle === undefined) {
      throw new Error("source editor missing");
    }
    act(() => handle.find.setQuery("atlas"));
    expect(handle.find.snapshot()).toEqual({ current: 1, total: 3 });
    expect(host.querySelector("pre")?.textContent).toBe(source);
    expect(changes).toEqual([]);
    act(() => handle.insertText("Atlas "));
    expect(handle.find.snapshot().total).toBe(4);
    act(() => handle.find.setQuery(null));
    expect(host.querySelector(".note-find-match")).toBeNull();
  });

  it("should close find in the capture window without replacing its editor", async ({
    onTestFinished,
  }) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    onTestFinished(() => {
      act(() => root.unmount());
      host.remove();
    });
    await act(async () => {
      root.render(createElement(CaptureWindow));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.waitFor(() =>
        expect(host.querySelector(".ProseMirror")).not.toBeNull()
      );
    });
    const editor = host.querySelector(".ProseMirror");
    if (editor === null) {
      throw new Error("capture editor missing");
    }
    const modifier =
      detectPlatform() === "mac" ? { metaKey: true } : { ctrlKey: true };
    await act(async () => {
      key(editor, "f", modifier);
      await Promise.resolve();
    });
    const input = host.querySelector('input[aria-label="find text"]');
    expect(input).not.toBeNull();
    if (input === null) {
      throw new Error("capture find missing");
    }
    await act(async () => {
      key(input, "Escape");
      await Promise.resolve();
    });
    expect(host.querySelector('input[aria-label="find text"]')).toBeNull();
    expect(host.querySelector(".ProseMirror")).toBe(editor);
  });
});
