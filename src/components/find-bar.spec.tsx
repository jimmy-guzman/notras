import { detectPlatform } from "@tanstack/react-hotkeys";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { createEditorExtensions } from "@/components/editor/extensions";
import { createFindHandle, Find } from "@/components/editor/find";
import { createNoteDocument } from "@/components/editor/note-document";
import { SourceEditor } from "@/components/editor/source-editor";
import type { SourceEditorHandle } from "@/components/editor/source-editor";
import { createFindController } from "@/lib/ui/find";

import { CaptureWindow } from "./capture-window";
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
    act(() => {
      controller.open();
    });
    const input = screen.getByRole("textbox", { name: "find text" });
    expect(input).toHaveFocus();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    act(() => {
      editor.view.focus();
    });
    await user.keyboard("{Meta>}{Shift>}g{/Shift}{/Meta}");
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    act(() => {
      input.focus();
    });
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
    act(() => {
      editor.view.focus();
    });
    await user.keyboard("{Meta>}{Alt>}g{/Alt}{/Meta}");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("should leave focus in the editor when a search opens the bar after an earlier find", ({
    onTestFinished,
  }) => {
    const surface = document.createElement("div");
    document.body.append(surface);

    const editor = new Editor({
      content: "Plan Atlas Atlas",
      contentType: "markdown",
      element: surface,
      extensions: [...createEditorExtensions({}), Find],
    });

    onTestFinished(() => {
      editor.destroy();
      surface.remove();
    });
    const controller = createFindController();
    controller.bind(createFindHandle(editor), "tab");
    render(createElement(FindBar, { controller }));
    act(() => {
      controller.open();
    });
    act(() => {
      controller.close();
    });
    act(() => {
      controller.search("atlas", "tab");
    });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "find text" })
    ).not.toHaveFocus();
    expect(document.activeElement).toHaveClass("ProseMirror");
  });

  it("should highlight a search's one match without the bar or its space until ⌘G, ⌘F or Escape", async ({
    onTestFinished,
  }) => {
    const user = userEvent.setup();
    const surface = document.createElement("div");
    document.body.append(surface);

    const editor = new Editor({
      content: "Plan Atlas",
      contentType: "markdown",
      element: surface,
      extensions: [...createEditorExtensions({}), Find],
    });

    onTestFinished(() => {
      editor.destroy();
      surface.remove();
    });
    const controller = createFindController();
    controller.bind(createFindHandle(editor), "tab");
    render(createElement(FindBar, { controller }));
    act(() => {
      controller.search("atlas", "tab");
    });
    expect(
      screen.queryByRole("textbox", { name: "find text" })
    ).not.toBeInTheDocument();
    expect(surface.querySelector(".note-find-match")).toHaveTextContent(
      "Atlas"
    );
    expect(surface.querySelector(".note-find-open")).toBeNull();

    await user.keyboard("{Meta>}g{/Meta}");
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(surface.querySelector(".note-find-open")).not.toBeNull();

    act(() => {
      controller.close();
      controller.search("atlas", "tab");
    });
    expect(surface.querySelector(".note-find-open")).toBeNull();
    act(() => {
      controller.open();
    });
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(surface.querySelector(".note-find-open")).not.toBeNull();

    act(() => {
      controller.close();
      controller.search("atlas", "tab");
    });
    await user.keyboard("{Escape}");
    expect(surface.querySelector(".note-find-match")).toBeNull();
    expect(surface.querySelector(".note-find-open")).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "find text" })
    ).not.toBeInTheDocument();
  });

  it("should keep a search's bar shown or hidden as edits change its match count", ({
    onTestFinished,
  }) => {
    const one = new Editor({
      content: "Plan Atlas",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: [...createEditorExtensions({}), Find],
    });

    const two = new Editor({
      content: "Plan Atlas Atlas",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: [...createEditorExtensions({}), Find],
    });

    onTestFinished(() => {
      one.destroy();
      two.destroy();
    });
    const controller = createFindController();
    controller.bind(createFindHandle(one), "one");
    render(createElement(FindBar, { controller }));
    act(() => {
      controller.search("atlas", "one");
    });
    act(() => {
      one.commands.insertContentAt(one.state.doc.content.size - 1, " Atlas");
    });
    expect(
      screen.queryByRole("textbox", { name: "find text" })
    ).not.toBeInTheDocument();

    act(() => {
      controller.search("atlas", "two");
      controller.bind(createFindHandle(two), "two");
    });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    act(() => {
      two.commands.deleteRange({
        from: two.state.doc.content.size - 7,
        to: two.state.doc.content.size - 1,
      });
    });
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("should hide the bar while a search waits for its note and show it only when that note has several matches", ({
    onTestFinished,
  }) => {
    const two = new Editor({
      content: "Atlas Atlas",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: [...createEditorExtensions({}), Find],
    });

    const one = new Editor({
      content: "Atlas",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: [...createEditorExtensions({}), Find],
    });

    const three = new Editor({
      content: "Atlas Atlas Atlas",
      contentType: "markdown",
      element: document.createElement("div"),
      extensions: [...createEditorExtensions({}), Find],
    });

    onTestFinished(() => {
      two.destroy();
      one.destroy();
      three.destroy();
    });
    const controller = createFindController();
    controller.bind(createFindHandle(two), "two");
    render(createElement(FindBar, { controller }));
    act(() => {
      controller.search("atlas", "two");
    });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    act(() => {
      controller.search("atlas", "one");
    });
    expect(
      screen.queryByRole("textbox", { name: "find text" })
    ).not.toBeInTheDocument();

    act(() => {
      controller.bind(createFindHandle(one), "one");
    });
    expect(
      screen.queryByRole("textbox", { name: "find text" })
    ).not.toBeInTheDocument();

    act(() => {
      controller.search("atlas", "three");
    });
    expect(
      screen.queryByRole("textbox", { name: "find text" })
    ).not.toBeInTheDocument();

    act(() => {
      controller.bind(createFindHandle(three), "three");
    });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(three.view.dom).toHaveClass("note-find-open");
  });

  it("should search raw source including frontmatter and update without changing it", ({
    onTestFinished,
  }) => {
    const handles: SourceEditorHandle[] = [];
    const changes: string[] = [];
    const source = "---\ntitle: Atlas\n---\n# Atlas\n\n`Atlas`";

    const note = createNoteDocument(source, "atlas.md", () => {
      changes.push(note.content());
    });

    onTestFinished(() => {
      note.destroy();
    });

    const { container } = render(
      createElement(SourceEditor, {
        editor: note.editor,
        onReady: (ready) => {
          handles.push(ready);
        },
      })
    );

    const [handle] = handles;

    if (handle === undefined) {
      throw new Error("source editor missing");
    }

    act(() => {
      handle.find.setQuery("atlas");
    });
    expect(handle.find.snapshot()).toStrictEqual({ current: 1, total: 3 });
    expect(container.querySelector("pre")?.textContent).toBe(source);
    expect(changes).toStrictEqual([]);
    act(() => {
      handle.insertText("Atlas ");
    });
    expect(handle.find.snapshot().total).toBe(4);
    act(() => {
      handle.find.setQuery(null);
    });
    expect(container.querySelector(".note-find-match")).toBeNull();
  });

  it("should close find in the capture window without replacing its editor", async () => {
    const user = userEvent.setup();
    mockWindows("capture");
    mockIPC(() => null);
    const { container } = render(createElement(CaptureWindow));
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror")).toBeInTheDocument()
    );
    const editor = container.querySelector(".ProseMirror");

    if (!(editor instanceof HTMLElement)) {
      throw new TypeError("capture editor missing");
    }

    act(() => {
      editor.focus();
    });
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
