import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor as TiptapEditor } from "@tiptap/core";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CaptureWindow } from "@/components/capture-window";

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

describe("capture window", () => {
  afterEach(() => {
    cleanup();
    clearMocks();
  });

  describe("capture persistence", () => {
    it.each([false, true])(
      "should block repeated saves until hiding settles, including failure: %s",
      async (hideFails) => {
        const user = userEvent.setup();
        const hidden = Promise.withResolvers<null>();
        const writes: unknown[] = [];
        const hides: string[] = [];
        mockIPC(async (command, args) => {
          if (command === "create_note") {
            writes.push(args);
            return { path: "inbox/jot.md", updatedAt: 1, warnings: [] };
          }
          if (command === "plugin:window|hide") {
            hides.push(command);
            return hides.length === 1 ? await hidden.promise : null;
          }
          return null;
        });
        const editor = await mountCapture();
        act(() => {
          editor.commands.insertContent("a captured thought");
        });
        await user.keyboard("{Escape}");
        await waitFor(() => {
          expect(hides).toHaveLength(1);
        });
        await user.keyboard(
          "{Escape}{Control>}{Enter}{/Control}{Meta>}{Enter}{/Meta}"
        );
        expect(hides).toHaveLength(1);
        expect(writes).toHaveLength(1);
        await act(async () => {
          if (hideFails) {
            hidden.reject(new Error("window unavailable"));
          } else {
            hidden.resolve(null);
          }
          await Promise.resolve();
        });
        await waitFor(() => {
          expect(
            document.body.textContent?.includes("could not hide the capture")
          ).toBe(hideFails);
        });
        await user.keyboard("{Escape}");
        await waitFor(() => {
          expect(hides).toHaveLength(2);
        });
        expect(writes).toHaveLength(1);
      }
    );

    it("should let native creation name a capture from its content", async () => {
      const user = userEvent.setup();
      const writes: unknown[] = [];
      mockIPC((command, args) => {
        if (command === "create_note") {
          writes.push(args);
          return {
            path: "inbox/a-captured-thought.md",
            updatedAt: 1,
            warnings: [],
          };
        }
        return null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("a captured thought");
      });
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(writes).toMatchObject([
          {
            options: {
              content: "a captured thought",
              folder: "inbox",
              name: null,
            },
          },
        ]);
      });
    });

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
        return null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("a captured thought");
      });
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(writes).toHaveLength(1);
        expect(hides).toHaveLength(1);
        expect(document.querySelector(".ProseMirror")?.textContent).toBe("");
      });
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(hides).toHaveLength(2);
        expect(writes).toHaveLength(1);
      });
    });

    it("should retain the jot and show the reason when no file committed", async () => {
      const user = userEvent.setup();
      const hides: string[] = [];
      const refused = vi.fn<() => Promise<never>>().mockRejectedValue({
        kind: "failed",
        message: "the disk is full",
      });
      mockIPC(async (command) => {
        if (command === "create_note") {
          return await refused();
        }
        if (command === "plugin:window|hide") {
          hides.push(command);
        }
        return null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("keep this thought");
      });
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(hides).toStrictEqual([]);
        expect(document.querySelector(".ProseMirror")?.textContent).toBe(
          "keep this thought"
        );
        expect(document.body.textContent).toContain(
          "could not save the capture"
        );
        expect(document.body.textContent).toContain("the disk is full");
      });
    });
  });
});
