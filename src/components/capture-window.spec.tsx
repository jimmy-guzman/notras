import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { Editor as TiptapEditor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CaptureWindow } from "@/components/capture-window";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;

afterEach(async () => {
  await act(() => {
    root?.unmount();
  });
  clearMocks();
  document.body.innerHTML = "";
});

async function mountCapture() {
  mockWindows("capture");
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => {
    root?.render(createElement(CaptureWindow));
  });
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
  const surface = container.querySelector(".ProseMirror");
  if (
    surface === null ||
    !("editor" in surface) ||
    !(surface.editor instanceof TiptapEditor)
  ) {
    throw new Error("the capture editor did not mount");
  }
  return surface.editor;
}

async function pressEscape() {
  await act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
    );
  });
}

describe("capture persistence", () => {
  it("should clear and hide a committed capture when indexing reports a warning", async () => {
    const writes: unknown[] = [];
    const hides: string[] = [];
    mockIPC((command, args) => {
      if (command === "create_note") {
        writes.push(args);
        return {
          path: "inbox/jot.md",
          updatedAt: 1,
          warnings: [
            {
              kind: "index",
              message: "the index is read-only",
              path: "inbox/jot.md",
            },
          ],
        };
      }
      if (command === "plugin:window|hide") {
        hides.push(command);
      }
    });
    const editor = await mountCapture();
    act(() => {
      editor.commands.insertContent("a captured thought");
    });
    await pressEscape();
    expect(writes).toHaveLength(1);
    expect(hides).toHaveLength(1);
    expect(document.querySelector(".ProseMirror")?.textContent).toBe("");
    await pressEscape();
    expect(writes).toHaveLength(1);
  });

  it("should retain the jot and show the reason when no file committed", async () => {
    const hides: string[] = [];
    mockIPC((command) => {
      if (command === "create_note") {
        return Promise.reject({ kind: "failed", message: "the disk is full" });
      }
      if (command === "plugin:window|hide") {
        hides.push(command);
      }
    });
    const editor = await mountCapture();
    act(() => {
      editor.commands.insertContent("keep this thought");
    });
    await pressEscape();
    expect(hides).toEqual([]);
    expect(document.querySelector(".ProseMirror")?.textContent).toBe(
      "keep this thought"
    );
    expect(document.body.textContent).toContain("could not save the capture");
    expect(document.body.textContent).toContain("the disk is full");
  });
});
