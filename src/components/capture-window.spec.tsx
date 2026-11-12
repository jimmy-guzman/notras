import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor as TiptapEditor } from "@tiptap/core";
import { createElement } from "react";
import { object, parse, string } from "valibot";
import { describe, expect, it, vi } from "vitest";

import { SENTINEL } from "@/components/editor/sentinel";
import { chordGlyph } from "@/lib/ui/shortcuts";

import { CaptureWindow } from "./capture-window";

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

    it("should report a jot it cannot read and save it on the next esc", async () => {
      const user = userEvent.setup();
      const calls: string[] = [];
      mockIPC(
        (command) => {
          calls.push(command);

          return command === "create_note"
            ? { path: "jot.md", updatedAt: 1, warnings: [] }
            : null;
        },
        { shouldMockEvents: true }
      );
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("keep this thought");
      });
      const converter = editor.markdown;
      editor.markdown = undefined;
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(document.body.textContent).toContain(
          "could not save the capture"
        );
        expect(document.body.textContent).toContain(
          "The editor has no Markdown converter"
        );
      });
      expect(calls).toStrictEqual([]);
      expect(document.querySelector(".ProseMirror")?.textContent).toBe(
        "keep this thought"
      );
      editor.markdown = converter;
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(calls).toStrictEqual(["create_note", "plugin:window|hide"]);
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

    it("should say the update waits when a failed save gives no reason", async () => {
      const refused = vi.fn<() => Promise<never>>().mockRejectedValue({
        kind: "failed",
        message: "   ",
      });

      mockIPC(
        async (command) => {
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
        expect(document.body.textContent).toContain(
          "could not restart into the update"
        );
        expect(document.body.textContent).toContain(
          "The update applies on next launch"
        );
      });
      expect(document.body.textContent).not.toContain("undefined");
    });

    it("should call off the quit when the jot cannot be read", async () => {
      const calls: string[] = [];
      mockIPC(
        (command) => {
          calls.push(command);

          return null;
        },
        { shouldMockEvents: true }
      );
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("keep this thought");
      });
      editor.markdown = undefined;
      await emit("app-quit", { ending: "exit" });
      await waitFor(() => {
        expect(calls).toStrictEqual(["cancel_quit"]);
        expect(document.body.textContent).toContain(
          "The editor has no Markdown converter"
        );
      });
      expect(document.querySelector(".ProseMirror")?.textContent).toBe(
        "keep this thought"
      );
    });

    it("should still call off a quit after an esc failed to read the jot", async () => {
      const user = userEvent.setup();
      const calls: string[] = [];
      mockIPC(
        (command) => {
          calls.push(command);

          return null;
        },
        { shouldMockEvents: true }
      );
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("keep this thought");
      });
      editor.markdown = undefined;
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(document.body.textContent).toContain(
          "could not save the capture"
        );
      });
      await emit("app-quit", { ending: "exit" });
      await waitFor(() => {
        expect(calls).toStrictEqual(["cancel_quit"]);
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

  describe("continuing", () => {
    it("should save the jot and hand it to the main window with its caret before hiding", async () => {
      const user = userEvent.setup();
      const calls: { args: unknown; command: string }[] = [];
      mockIPC((command, args) => {
        calls.push({ args, command });

        return command === "create_note"
          ? { path: "a-thought.md", updatedAt: 1, warnings: [] }
          : null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("a thought");
        editor.commands.setTextSelection(3);
      });
      await user.keyboard("{Control>}o{/Control}");
      await waitFor(() => {
        expect(calls.map(({ command }) => command)).toContain(
          "plugin:window|hide"
        );
      });
      expect(calls.slice(-3).map(({ command }) => command)).toStrictEqual([
        "create_note",
        "continue_jot",
        "plugin:window|hide",
      ]);
      expect(
        calls.find(({ command }) => command === "continue_jot")?.args
      ).toStrictEqual({ jot: { caret: 2, path: "a-thought.md" } });
      await waitFor(() => {
        expect(document.querySelector(".ProseMirror")?.textContent).toBe("");
      });
    });

    it("should go to the main window without a note when the jot is empty", async () => {
      const user = userEvent.setup();
      const calls: { args: unknown; command: string }[] = [];
      mockIPC((command, args) => {
        calls.push({ args, command });

        return null;
      });
      await mountCapture();
      await user.keyboard("{Control>}o{/Control}");
      await waitFor(() => {
        expect(calls.map(({ command }) => command)).toContain(
          "plugin:window|hide"
        );
      });
      expect(calls.map(({ command }) => command)).not.toContain("create_note");
      expect(
        calls.find(({ command }) => command === "continue_jot")?.args
      ).toStrictEqual({ jot: null });
    });

    it("should keep the jot on screen and stay out of the main window when it cannot be saved", async () => {
      const user = userEvent.setup();
      const calls: string[] = [];
      mockIPC((command) => {
        calls.push(command);

        if (command === "create_note") {
          throw new Error("The disk is full");
        }

        return null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("a thought");
      });
      await user.keyboard("{Control>}o{/Control}");
      await waitFor(() => {
        expect(document.body.textContent).toContain(
          "could not save the capture"
        );
      });
      expect(calls).not.toContain("continue_jot");
      expect(calls).not.toContain("plugin:window|hide");
      expect(document.querySelector(".ProseMirror")?.textContent).toBe(
        "a thought"
      );
    });

    it("should keep the window up and clear the written jot when the main window cannot be reached", async () => {
      const user = userEvent.setup();
      const calls: string[] = [];
      mockIPC((command) => {
        calls.push(command);

        if (command === "continue_jot") {
          throw new Error("The window is no longer available");
        }

        return command === "create_note"
          ? { path: "a-thought.md", updatedAt: 1, warnings: [] }
          : null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.insertContent("a thought");
      });
      await user.keyboard("{Control>}o{/Control}");
      await waitFor(() => {
        expect(document.body.textContent).toContain("could not open notras");
      });
      await waitFor(() => {
        expect(document.querySelector(".ProseMirror")?.textContent).toBe("");
      });
      expect(calls).not.toContain("plugin:window|hide");
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(calls).toContain("plugin:window|hide");
      });
      expect(calls.filter((command) => command === "create_note")).toHaveLength(
        1
      );
    });

    it("should show the reason when the main window refuses a bare string", async () => {
      const user = userEvent.setup();

      const refused = vi
        .fn<() => Promise<never>>()
        .mockRejectedValue("invalid args for command continue_jot");

      mockIPC(async (command) => {
        if (command === "continue_jot") {
          return await refused();
        }

        return null;
      });
      await mountCapture();
      await user.keyboard("{Control>}o{/Control}");
      await waitFor(() => {
        expect(document.body.textContent).toContain("could not open notras");
        expect(document.body.textContent).toContain(
          "invalid args for command continue_jot"
        );
      });
    });

    it("should open a jot at its end when the caret offset cannot be read", async () => {
      const user = userEvent.setup();
      const handed: unknown[] = [];
      const written: string[] = [];
      mockIPC((command, args) => {
        if (command === "continue_jot") {
          handed.push(args);
        }

        if (command === "create_note") {
          const { options } = parse(
            object({ options: object({ content: string() }) }),
            args
          );

          written.push(options.content);

          return { path: "jot.md", updatedAt: 1, warnings: [] };
        }

        return null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.setContent(`|a|b|\n|-|-|\n|${SENTINEL}xy|2|\n`, {
          contentType: "markdown",
        });
      });
      const positions: number[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.text === `${SENTINEL}xy`) {
          positions.push(pos + `${SENTINEL}x`.length);
        }
      });
      act(() => {
        editor.commands.setTextSelection(positions[0] ?? -1);
      });
      await user.keyboard("{Control>}o{/Control}");
      await waitFor(() => {
        expect(handed).toHaveLength(1);
      });
      expect(handed).toStrictEqual([
        { jot: { caret: written[0]?.length, path: "jot.md" } },
      ]);
    });

    it("should hand off the caret in a table cell the file escapes", async () => {
      const user = userEvent.setup();
      const handed: unknown[] = [];
      const written: string[] = [];
      mockIPC((command, args) => {
        if (command === "continue_jot") {
          handed.push(args);

          return null;
        }

        if (command === "create_note") {
          const { options } = parse(
            object({ options: object({ content: string() }) }),
            args
          );

          written.push(options.content);

          return { path: "jot.md", updatedAt: 1, warnings: [] };
        }

        return null;
      });
      const editor = await mountCapture();
      act(() => {
        editor.commands.setContent("|a|b|\n|-|-|\n|&lt;div&gt;|2|\n", {
          contentType: "markdown",
        });
      });
      const positions: number[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.text === "<div>") {
          positions.push(pos + "<d".length);
        }
      });
      act(() => {
        editor.commands.setTextSelection(positions[0] ?? -1);
      });
      await user.keyboard("{Control>}o{/Control}");
      await waitFor(() => {
        expect(handed).toHaveLength(1);
      });

      const saved =
        "| a           | b   |\n| ----------- | --- |\n| &lt;div&gt; | 2   |";

      expect(written).toStrictEqual([saved]);
      expect(handed).toStrictEqual([
        {
          jot: {
            caret: saved.indexOf("&lt;div") + "&lt;d".length,
            path: "jot.md",
          },
        },
      ]);
    });

    it("should show the chord that continues in notras", async () => {
      mockIPC(() => null);
      await mountCapture();

      const footer = document.querySelector("footer")?.textContent;

      expect(footer).toContain("continues in notras");
      expect(footer).toContain(chordGlyph("Mod+O"));
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
