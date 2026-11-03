import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor as TiptapEditor } from "@tiptap/core";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

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

            return { path: "jot.md", updatedAt: 1, warnings: [] };
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

    it("should create a capture outside any folder and let native creation name it", async () => {
      const user = userEvent.setup();
      const writes: unknown[] = [];
      mockIPC((command, args) => {
        if (command === "create_note") {
          writes.push(args);

          return {
            path: "a-captured-thought.md",
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
        expect(writes).toStrictEqual([
          { options: { content: "a captured thought", name: null } },
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
            path: "jot.md",
            updatedAt: 1,
            warnings: [
              {
                kind: "index",
                message: "the index is read-only",
                path: "jot.md",
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
        message: "The disk is full",
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
        expect(document.body.textContent).toContain("The disk is full");
      });
    });
  });

  describe("closing and quitting", () => {
    it("should save and hide the jot when the window is closed", async () => {
      const calls: string[] = [];
      mockIPC(
        (command) => {
          calls.push(command);

          if (command === "create_note") {
            return { path: "jot.md", updatedAt: 1, warnings: [] };
          }

          return null;
        },
        { shouldMockEvents: true }
      );
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("closed, not lost");
      });
      await emit("tauri://close-requested");
      await waitFor(() => {
        expect(calls).toStrictEqual(["create_note", "plugin:window|hide"]);
        expect(document.querySelector(".ProseMirror")?.textContent).toBe("");
      });
    });

    it("should save and clear the jot before answering a quit", async () => {
      const calls: string[] = [];
      mockIPC(
        (command) => {
          calls.push(command);

          if (command === "create_note") {
            return { path: "jot.md", updatedAt: 1, warnings: [] };
          }

          return null;
        },
        { shouldMockEvents: true }
      );
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("quit, not lost");
      });
      await emit("app-quit", { ending: "exit" });
      await waitFor(() => {
        expect(calls).toStrictEqual([
          "create_note",
          "plugin:window|hide",
          "quit_app",
        ]);
        expect(document.querySelector(".ProseMirror")?.textContent).toBe("");
      });
    });

    it("should answer a quit without a write when the jot is empty", async () => {
      const calls: string[] = [];
      mockIPC(
        (command) => {
          calls.push(command);

          return null;
        },
        { shouldMockEvents: true }
      );
      await mountCapture();
      await emit("app-quit", { ending: "exit" });
      await waitFor(() => {
        expect(calls).toStrictEqual(["plugin:window|hide", "quit_app"]);
      });
    });

    it("should call off the quit and keep the jot when it cannot be saved", async () => {
      const calls: string[] = [];

      const refused = vi.fn<() => Promise<never>>().mockRejectedValue({
        kind: "failed",
        message: "The disk is full",
      });

      mockIPC(
        async (command) => {
          calls.push(command);

          if (command === "create_note") {
            return await refused();
          }

          return null;
        },
        { shouldMockEvents: true }
      );
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("keep this thought");
      });
      await emit("app-quit", { ending: "exit" });
      await waitFor(() => {
        expect(calls).toStrictEqual(["create_note", "cancel_quit"]);
        expect(document.querySelector(".ProseMirror")?.textContent).toBe(
          "keep this thought"
        );
        expect(document.body.textContent).toContain("The disk is full");
      });
    });

    it("should say the update waits when a jot cannot be saved for the restart", async () => {
      const calls: string[] = [];

      const refused = vi.fn<() => Promise<never>>().mockRejectedValue({
        kind: "failed",
        message: "The disk is full",
      });

      mockIPC(
        async (command) => {
          calls.push(command);

          if (command === "create_note") {
            return await refused();
          }

          return null;
        },
        { shouldMockEvents: true }
      );
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("keep this thought");
      });
      await emit("app-quit", { ending: "restart" });
      await waitFor(() => {
        expect(calls).toStrictEqual(["create_note", "cancel_quit"]);
        expect(document.body.textContent).toContain(
          "could not restart into the update"
        );
        expect(document.body.textContent).toContain(
          "The disk is full, so the update applies on next launch"
        );
      });
    });

    it("should write a jot once when a quit lands during its save", async () => {
      const user = userEvent.setup();

      const written = Promise.withResolvers<{
        path: string;
        updatedAt: number;
        warnings: never[];
      }>();

      const calls: string[] = [];
      mockIPC(
        async (command) => {
          calls.push(command);

          if (command === "create_note") {
            return await written.promise;
          }

          return null;
        },
        { shouldMockEvents: true }
      );
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("one copy only");
      });
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(calls).toStrictEqual(["create_note"]);
      });
      await emit("app-quit", { ending: "exit" });
      await act(async () => {
        written.resolve({
          path: "one-copy-only.md",
          updatedAt: 1,
          warnings: [],
        });
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(calls).toStrictEqual([
          "create_note",
          "plugin:window|hide",
          "plugin:window|hide",
          "quit_app",
        ]);
      });
    });
  });

  describe("discarding", () => {
    it("should throw the jot away and hide without saving", async () => {
      const user = userEvent.setup();
      const calls: string[] = [];
      mockIPC((command) => {
        calls.push(command);

        return null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("a stray paste");
      });
      await user.keyboard("{Control>}{Shift>}{Backspace}{/Shift}{/Control}");
      await waitFor(() => {
        expect(calls).toContain("plugin:window|hide");
        expect(document.querySelector(".ProseMirror")?.textContent).toBe("");
      });
      expect(calls).not.toContain("create_note");
    });

    it("should leave the jot alone while find is open", async () => {
      const user = userEvent.setup();
      const calls: string[] = [];
      mockIPC((command) => {
        calls.push(command);

        return null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("still here");
      });
      await user.keyboard("{Control>}f{/Control}");
      await user.keyboard("{Control>}{Shift>}{Backspace}{/Shift}{/Control}");
      expect(calls).not.toContain("plugin:window|hide");
      expect(document.querySelector(".ProseMirror")?.textContent).toBe(
        "still here"
      );
    });

    it("should leave the editor's own delete-to-line-start alone", async () => {
      const user = userEvent.setup();
      const calls: string[] = [];
      mockIPC((command) => {
        calls.push(command);

        return null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("<p>first line</p><p>second line</p>");
        editor.commands.focus("end");
      });
      await user.keyboard("{Control>}{Backspace}{/Control}");
      expect(calls).not.toContain("plugin:window|hide");
      expect(document.querySelector(".ProseMirror")?.textContent).toContain(
        "first line"
      );
    });
  });

  describe("mark", () => {
    it("should blink while the jot is empty and hold still once it has text", async () => {
      mockIPC(() => null);
      const editor = await mountCapture();
      expect(
        document.querySelector("footer .mark-blinking")
      ).toBeInTheDocument();
      act(() => {
        editor.commands.insertContent("a thought");
      });
      await waitFor(() => {
        expect(
          document.querySelector("footer .mark-blinking")
        ).not.toBeInTheDocument();
      });
      expect(document.querySelectorAll("footer circle")).toHaveLength(2);
    });

    it("should go meh when a save fails and blink again after a discard", async () => {
      const user = userEvent.setup();

      const refused = vi.fn<() => Promise<never>>().mockRejectedValue({
        kind: "failed",
        message: "The disk is full",
      });

      mockIPC(async (command) => {
        if (command === "create_note") {
          return await refused();
        }

        return null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("keep this thought");
      });
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(document.body.textContent).toContain("The disk is full");
        expect(document.querySelectorAll("footer circle")).toHaveLength(0);
      });
      await user.keyboard("{Control>}{Shift>}{Backspace}{/Shift}{/Control}");
      await waitFor(() => {
        expect(
          document.querySelector("footer .mark-blinking")
        ).toBeInTheDocument();
      });
    });
  });
});
