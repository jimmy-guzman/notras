import { detectPlatform } from "@tanstack/react-hotkeys";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { CaptureWindow } from "@/components/capture-window";
import { createEditorExtensions } from "@/components/editor/extensions";
import { createFindHandle, Find } from "@/components/editor/find";
import { createNoteDocument } from "@/components/editor/note-document";
import {
  SourceEditor,
  type SourceEditorHandle,
} from "@/components/editor/source-editor";
import { createFindController } from "@/lib/ui/find";
import { FindBar } from "./find-bar";

describe("find controls", () => {
  it("should navigate from the input and editor and consume Escape before capture saves", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const surface = document.createElement("div");
    document.body.append(surface);
    const editor = new Editor({
      content: "Atlas Atlas",
      contentType: "markdown",
      element: surface,
      extensions: [...createEditorExtensions({}), Find],
    });
    const controller = createFindController();
    controller.bind(createFindHandle(editor));
    controller.setQuery("atlas");
    let escaped = 0;
    const captureSave = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        escaped += 1;
      }
    };
    document.addEventListener("keydown", captureSave);
    onTestFinished(() => {
      document.removeEventListener("keydown", captureSave);
      editor.destroy();
      surface.remove();
    });
    render(createElement(FindBar, { controller }));
    act(() => controller.open());
    const input = screen.getByRole("textbox", { name: "find text" });
    expect(input).toHaveFocus();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    act(() => editor.view.focus());
    await user.keyboard("{Meta>}{Shift>}g{/Shift}{/Meta}");
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    act(() => input.focus());
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("textbox", { name: "find text" })
    ).not.toBeInTheDocument();
    expect(escaped).toBe(0);
    expect(editor.state.doc.textContent).toBe("Atlas Atlas");
    expect(editor.view.dom).toHaveFocus();
    expect(editor.view.dom.querySelector(".note-find-match")).toBeNull();
    await user.keyboard("{Meta>}g{/Meta}");
    expect(
      screen.getByRole("textbox", { name: "find text" })
    ).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    act(() => editor.view.focus());
    await user.keyboard("{Meta>}{Alt>}g{/Alt}{/Meta}");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("should search raw source including frontmatter and update without changing it", ({
    onTestFinished,
  }) => {
    const handles: SourceEditorHandle[] = [];
    const changes: string[] = [];
    const source = "---\ntitle: Atlas\n---\n# Atlas\n\n`Atlas`";
    const note = createNoteDocument(source, "atlas.md", () =>
      changes.push(note.content())
    );
    onTestFinished(() => note.destroy());
    const { container } = render(
      createElement(SourceEditor, {
        editor: note.editor,
        onReady: (ready) => handles.push(ready),
      })
    );
    const [handle] = handles;
    if (handle === undefined) {
      throw new Error("source editor missing");
    }
    act(() => handle.find.setQuery("atlas"));
    expect(handle.find.snapshot()).toEqual({ current: 1, total: 3 });
    expect(container.querySelector("pre")?.textContent).toBe(source);
    expect(changes).toEqual([]);
    act(() => handle.insertText("Atlas "));
    expect(handle.find.snapshot().total).toBe(4);
    act(() => handle.find.setQuery(null));
    expect(container.querySelector(".note-find-match")).toBeNull();
  });

  it("should close find in the capture window without replacing its editor", async () => {
    const user = userEvent.setup();
    const { container } = render(createElement(CaptureWindow));
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror")).toBeInTheDocument()
    );
    const editor = container.querySelector(".ProseMirror");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("capture editor missing");
    }
    act(() => editor.focus());
    const modifier = detectPlatform() === "mac" ? "Meta" : "Control";
    await user.keyboard(`{${modifier}>}f{/${modifier}}`);
    expect(
      screen.getByRole("textbox", { name: "find text" })
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("textbox", { name: "find text" })
    ).not.toBeInTheDocument();
    expect(container.querySelector(".ProseMirror")).toBe(editor);
  });
});
