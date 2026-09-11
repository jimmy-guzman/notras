import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor as TiptapEditor } from "@tiptap/core";
import { createElement } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { createEditorExtensions } from "@/components/editor/extensions";
import { SENTINEL } from "@/components/editor/sentinel";

import type { EditorHandle } from "./editor";
import { Editor } from "./editor";

/**
 * Mount the editor and hand back its scroller div and handle. happy-dom
 * computes no CSS, so the observable seam is the class the stylesheet keys
 * off, the same seam TipTap's own `has-focus` is.
 */
const mount = async (modes: {
  focusModeEnabled?: boolean;
  initialContent?: string;
}) => {
  const handles: EditorHandle[] = [];

  const { container: host } = render(
    createElement(Editor, {
      initialContent: "first\n\nsecond",
      ...modes,
      onChange: () => undefined,
      onReady: (ready) => {
        handles.push(ready);
      },
    })
  );

  await waitFor(() => expect(handles).toHaveLength(1));
  const [handle] = handles;
  const scroller = host.firstElementChild;

  if (!(scroller instanceof HTMLElement) || handle === undefined) {
    throw new Error("the editor did not mount");
  }

  return { handle, scroller };
};

describe("focus mode reading state", () => {
  it("should apply a document observation without losing selection or existing undo", async () => {
    const { handle, scroller } = await mount({
      initialContent: "# old\n\nbody",
    });
    const surface = scroller.querySelector(".ProseMirror");
    if (
      surface === null ||
      !("editor" in surface) ||
      !(surface.editor instanceof TiptapEditor)
    ) {
      throw new Error("the editor did not mount");
    }
    const { editor } = surface;
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.commands.insertContent(" plus typing");
    });
    const offset = editor.state.selection.$from.parentOffset;
    act(() => handle.replaceContent("# a longer title\n\nbody plus typing"));
    expect(scroller.querySelector(".ProseMirror")).toBe(surface);
    expect(handle.getContent()).toContain("# a longer title");
    expect(handle.getContent()).toContain("body plus typing");
    expect(editor.state.selection.$from.parentOffset).toBe(offset);
    act(() => {
      editor.commands.undo();
    });
    expect(handle.getContent()).toContain("# a longer title");
    expect(handle.getContent()).not.toContain("plus typing");
  });
  it("should lift the dim while scrolling", async () => {
    const { scroller } = await mount({ focusModeEnabled: true });

    fireEvent.wheel(scroller);

    expect(scroller).toHaveClass("focus-mode-on");
    expect(scroller).toHaveClass("focus-reading");
  });

  it("should restore the dim when the caret engages", async () => {
    const { handle, scroller } = await mount({ focusModeEnabled: true });

    fireEvent.wheel(scroller);
    act(() => {
      handle.insertText("x");
    });

    expect(scroller).not.toHaveClass("focus-reading");
  });

  it("should restore the dim when a click leaves the selection alone", async () => {
    const { scroller } = await mount({ focusModeEnabled: true });
    const surface = scroller.querySelector(".ProseMirror");

    if (surface === null) {
      throw new Error("the editor surface did not render");
    }

    fireEvent.wheel(scroller);
    fireEvent.click(surface);

    expect(scroller).not.toHaveClass("focus-reading");
  });

  it("should not track reading while focus mode is off", async () => {
    const { scroller } = await mount({ focusModeEnabled: false });

    fireEvent.wheel(scroller);

    expect(scroller).not.toHaveClass("focus-reading");
  });
});

describe("focus mode scroller", () => {
  it("should mark the scroller while focus mode is on", async () => {
    const { scroller } = await mount({ focusModeEnabled: true });

    expect(scroller).toHaveClass("focus-mode-on");
  });

  it("should not mark the scroller while focus mode is off", async () => {
    const { scroller } = await mount({ focusModeEnabled: false });

    expect(scroller).not.toHaveClass("focus-mode-on");
  });
});

describe("code block clipboard", () => {
  it("should preserve code editor metadata through the mounted editor", async () => {
    const { handle, scroller } = await mount({ initialContent: "" });
    const surface = scroller.querySelector(".ProseMirror");

    if (surface === null) {
      throw new Error("the editor surface did not render");
    }

    const clipboardData = new DataTransfer();

    clipboardData.setData("text/plain", "# comment\nprint(1)");
    clipboardData.setData("vscode-editor-data", '{"mode":"python"}');
    act(() => {
      surface.dispatchEvent(new ClipboardEvent("paste", { clipboardData }));
    });

    expect(handle.getContent().trimEnd()).toBe(
      "```python\n# comment\nprint(1)\n```"
    );
  });

  it.each([
    ["named", "```ts\nconst value = 1;\n```"],
    ["plain", "```\nplain code\n```"],
    ["unknown language", "```mermaid\ngraph TD\n```"],
    ["empty", "```ts\n\n```"],
    ["nested fences", "````markdown\n```ts\nconst value = 1;\n```\n````"],
  ])(
    "should copy a %s code block as fenced markdown",
    async (_name, markdown) => {
      const { scroller } = await mount({ initialContent: markdown });
      const user = userEvent.setup();
      const copy = screen.getByRole("button", { name: "copy code" });
      const surface = scroller.querySelector(".ProseMirror");

      if (!(copy instanceof HTMLButtonElement) || surface === null) {
        throw new Error("the code block did not render");
      }

      await user.click(copy);

      const copied = await navigator.clipboard.readText();

      expect(copied).toBe(markdown);
      expect(copy.textContent).toBe("copied");

      const pasted = new TiptapEditor({
        content: "",
        extensions: createEditorExtensions({}),
      });
      const clipboardData = new DataTransfer();

      clipboardData.setData("text/plain", copied);
      pasted.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData })
      );

      expect(pasted.state.doc.firstChild?.type.name).toBe("codeBlock");
      expect(pasted.state.doc.firstChild?.textContent).toBe(
        surface.querySelector("pre code")?.textContent
      );
      pasted.destroy();
    }
  );

  it("should copy the newly selected language and preserve it in markdown", async () => {
    const { handle } = await mount({
      initialContent: "```mermaid\ngraph TD\n```",
    });
    const user = userEvent.setup();
    const language = screen.getByRole<HTMLSelectElement>("combobox", {
      name: "code language",
    });
    const copy = screen.getByRole("button", { name: "copy code" });

    expect(language.value).toBe("mermaid");
    await user.selectOptions(language, "typescript");
    await user.click(copy);

    expect(language.value).toBe("typescript");
    expect(handle.getContent().trimEnd()).toBe("```typescript\ngraph TD\n```");
    expect(await navigator.clipboard.readText()).toBe(
      "```typescript\ngraph TD\n```"
    );

    await user.selectOptions(language, "");

    expect(handle.getContent().trimEnd()).toBe("```\ngraph TD\n```");
  });
});

describe("document selection mapping", () => {
  it("should deliver document edits without a selection when source mapping fails", async () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      createElement(Editor, {
        initialContent: "body",
        onChange,
        onSelect,
      })
    );
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror")).toBeInTheDocument()
    );
    const surface = container.querySelector(".ProseMirror");
    if (
      surface === null ||
      !("editor" in surface) ||
      !(surface.editor instanceof TiptapEditor)
    ) {
      throw new Error("the editor did not mount");
    }
    const { editor } = surface;
    const manager = editor.markdown;
    if (manager === undefined) {
      throw new Error("the editor has no markdown converter");
    }
    const serialize = manager.serialize.bind(manager);
    const failing = vi
      .spyOn(manager, "serialize")
      .mockImplementation((document) => {
        if (JSON.stringify(document).includes(SENTINEL)) {
          throw new Error("cannot map the selection");
        }
        return serialize(document);
      });
    onTestFinished(() => failing.mockRestore());
    onSelect.mockClear();
    act(() => {
      editor.commands.insertContent("new ");
    });
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.lastCall?.[0]).toContain("new body");
    expect(onChange.mock.lastCall?.[1].selection).toBeUndefined();
    expect(onSelect).not.toHaveBeenCalled();
    failing.mockRestore();
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 4 });
    });
    expect(onSelect).toHaveBeenLastCalledWith(0, 3);
    act(() => {
      editor.commands.insertContent("old");
    });
    expect(onChange.mock.lastCall?.[1].selection).toEqual({
      anchor: 3,
      head: 3,
    });
  });
});
