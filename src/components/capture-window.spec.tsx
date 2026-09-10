import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor as TiptapEditor } from "@tiptap/core";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CaptureWindow } from "@/components/capture-window";

afterEach(() => {
  cleanup();
  clearMocks();
});

async function mountCapture() {
  mockWindows("capture");
  const { container } = render(createElement(CaptureWindow));
  await waitFor(() =>
    expect(container.querySelector(".ProseMirror")).toBeInTheDocument()
  );
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

describe("capture persistence", () => {
  it("should clear and hide a committed capture when indexing reports a warning", async () => {
    const user = userEvent.setup();
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
    await user.keyboard("{Escape}");
    expect(writes).toHaveLength(1);
    expect(hides).toHaveLength(1);
    expect(document.querySelector(".ProseMirror")?.textContent).toBe("");
    await user.keyboard("{Escape}");
    expect(writes).toHaveLength(1);
  });

  it("should retain the jot and show the reason when no file committed", async () => {
    const user = userEvent.setup();
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
    await user.keyboard("{Escape}");
    expect(hides).toEqual([]);
    expect(document.querySelector(".ProseMirror")?.textContent).toBe(
      "keep this thought"
    );
    expect(document.body.textContent).toContain("could not save the capture");
    expect(document.body.textContent).toContain("the disk is full");
  });
});
