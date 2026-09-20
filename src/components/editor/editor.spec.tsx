import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor as TiptapEditor } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import { createElement, StrictMode } from "react";
import type { ComponentProps } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { createEditorExtensions } from "@/components/editor/extensions";
import { SENTINEL } from "@/components/editor/sentinel";

import type { EditorHandle } from "./editor";
import { Editor } from "./editor";

/**
 * Mount the editor and hand back its scroller div, its handle and the TipTap
 * instance TipTap attaches to the surface. happy-dom computes no CSS, so the
 * observable seam is the class the stylesheet keys off, the same seam TipTap's
 * own `has-focus` is.
 */
const mount = async (props: Partial<ComponentProps<typeof Editor>>) => {
  const handles: EditorHandle[] = [];

  const { container: host } = render(
    createElement(Editor, {
      initialContent: "first\n\nsecond",
      onChange: () => {},
      ...props,
      onReady: (ready) => {
        handles.push(ready);
      },
    })
  );

  await waitFor(() => {
    expect(handles).toHaveLength(1);
  });
  const [handle] = handles;
  const scroller = host.firstElementChild;
  const surface = host.querySelector(".ProseMirror");

  if (
    !(scroller instanceof HTMLElement) ||
    handle === undefined ||
    surface === null ||
    !("editor" in surface) ||
    !(surface.editor instanceof TiptapEditor)
  ) {
    throw new Error("the editor did not mount");
  }

  return { editor: surface.editor, handle, scroller };
};

describe("focus through the handle", () => {
  it("should keep the viewport where it was when focus reveals the caret", async () => {
    const { editor, handle, scroller } = await mount({ focusOnMount: false });
    const viewport = scroller.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (viewport === null) {
      throw new Error("the viewport did not mount");
    }
    // Fakes WebKit at the DOM boundary: focus reads `preventScroll` the way a
    // supporting engine does and still scrolls the caret into view inside the
    // call. ProseMirror decides once per module, on its first focus, whether
    // the engine honors the option, so this runs before any other focus here.
    Object.defineProperty(editor.view.dom, "focus", {
      value(this: HTMLElement, options?: FocusOptions) {
        void options?.preventScroll;
        HTMLElement.prototype.focus.call(this, options);
        viewport.scrollTop = 0;
      },
    });
    viewport.scrollTop = 120;

    act(() => {
      handle.focus();
    });

    expect(document.activeElement).toBe(editor.view.dom);
    expect(viewport.scrollTop).toBe(120);
  });
});

describe("focus mode reading state", () => {
  it("should apply a document observation without losing selection or existing undo", async () => {
    const { editor, handle, scroller } = await mount({
      initialContent: "# old\n\nbody",
    });
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.commands.insertContent(" plus typing");
    });
    const offset = editor.state.selection.$from.parentOffset;
    act(() => {
      handle.replaceContent("# a longer title\n\nbody plus typing");
    });
    expect(scroller.querySelector(".ProseMirror")).toBe(editor.view.dom);
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

    expect(scroller).toHaveAttribute("data-focus-mode", "true");
    expect(scroller).toHaveAttribute("data-reading", "true");
  });

  it("should restore the dim when the caret engages", async () => {
    const { handle, scroller } = await mount({ focusModeEnabled: true });

    fireEvent.wheel(scroller);
    act(() => {
      handle.insertText("x");
    });

    expect(scroller).toHaveAttribute("data-reading", "false");
  });

  it("should restore the dim when a click leaves the selection alone", async () => {
    const { scroller } = await mount({ focusModeEnabled: true });
    const surface = scroller.querySelector(".ProseMirror");

    if (surface === null) {
      throw new Error("the editor surface did not render");
    }

    fireEvent.wheel(scroller);
    fireEvent.click(surface);

    expect(scroller).toHaveAttribute("data-reading", "false");
  });

  it("should lift the dim while touch scrolling", async () => {
    const { scroller } = await mount({ focusModeEnabled: true });

    fireEvent.touchMove(scroller);

    expect(scroller).toHaveAttribute("data-reading", "true");
  });

  it("should lift the dim while the selection reaches another block", async () => {
    const { editor, scroller } = await mount({ focusModeEnabled: true });

    act(() => {
      editor.commands.setTextSelection({
        from: 2,
        to: editor.state.doc.content.size - 2,
      });
    });

    expect(scroller).toHaveAttribute("data-reading", "true");
  });

  it("should hold the dim for a selection inside one block", async () => {
    const { editor, scroller } = await mount({ focusModeEnabled: true });

    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 4 });
    });

    expect(scroller).toHaveAttribute("data-reading", "false");
  });

  it("should restore the dim when the selection collapses", async () => {
    const { editor, handle, scroller } = await mount({
      focusModeEnabled: true,
    });

    act(() => {
      editor.commands.setTextSelection({
        from: 2,
        to: editor.state.doc.content.size - 2,
      });
    });
    act(() => {
      handle.insertText("x");
    });

    expect(scroller).toHaveAttribute("data-reading", "false");
  });

  it("should keep the dim lifted when a click ends a selection across blocks", async () => {
    const { editor, scroller } = await mount({ focusModeEnabled: true });

    act(() => {
      editor.commands.setTextSelection({
        from: 2,
        to: editor.state.doc.content.size - 2,
      });
    });
    fireEvent.click(editor.view.dom);

    expect(scroller).toHaveAttribute("data-reading", "true");
  });

  it("should not track reading while focus mode is off", async () => {
    const { scroller } = await mount({ focusModeEnabled: false });

    fireEvent.wheel(scroller);

    expect(scroller).toHaveAttribute("data-reading", "false");
  });
});

describe("focus mode scroller", () => {
  it("should mark the scroller while focus mode is on", async () => {
    const { scroller } = await mount({ focusModeEnabled: true });

    expect(scroller).toHaveAttribute("data-focus-mode", "true");
  });

  it("should not mark the scroller while focus mode is off", async () => {
    const { scroller } = await mount({ focusModeEnabled: false });

    expect(scroller).toHaveAttribute("data-focus-mode", "false");
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
    expect(language.options).toHaveLength(1);
    await user.hover(language);
    expect(language.options.length).toBeGreaterThan(1);
    await user.selectOptions(language, "typescript");
    await user.click(copy);

    expect(language.value).toBe("typescript");
    expect(handle.getContent().trimEnd()).toBe("```typescript\ngraph TD\n```");
    await expect(navigator.clipboard.readText()).resolves.toBe(
      "```typescript\ngraph TD\n```"
    );

    await user.selectOptions(language, "");

    expect(handle.getContent().trimEnd()).toBe("```\ngraph TD\n```");
  });
});

describe("line breaks", () => {
  it("should break the line inside the block on shift+enter", async () => {
    const { editor, handle } = await mount({
      focusOnMount: true,
      initialContent: "onetwo",
    });
    const selection = document.getSelection();
    if (selection === null) {
      throw new Error("the document has no selection");
    }
    act(() => {
      editor.commands.setTextSelection(4);
    });
    // WebKit's repaint is the point and nothing here can see it; the rebuild
    // it takes is the seam.
    const addRange = vi.spyOn(selection, "addRange");

    // A native event: ProseMirror swallows Enter by its keyCode, which
    // user-event leaves at 0, so the key would land through the DOM instead.
    fireEvent.keyDown(editor.view.dom, {
      key: "Enter",
      keyCode: 13,
      shiftKey: true,
    });

    expect(editor.state.doc.childCount).toBe(1);
    expect(handle.getContent()).toBe("one  \ntwo");
    expect(addRange).toHaveBeenCalledOnce();
    expect(
      selection.anchorNode?.childNodes[selection.anchorOffset - 1]?.nodeName
    ).toBe("BR");
  });
});

describe("document selection mapping", () => {
  it("should replace the document when restoring its source selection fails", async () => {
    const { editor, handle, scroller } = await mount({
      initialContent: "old body",
    });
    const manager = editor.markdown;
    if (manager === undefined) {
      throw new Error("the editor has no markdown converter");
    }
    const parse = manager.parse.bind(manager);
    const failing = vi.spyOn(manager, "parse").mockImplementation((content) => {
      if (content.includes(SENTINEL)) {
        throw new Error("cannot map the selection");
      }
      return parse(content);
    });
    onTestFinished(() => {
      failing.mockRestore();
    });

    act(() => {
      handle.replaceContent("new body", { anchor: 2, head: 5 });
    });

    expect(handle.getContent().trimEnd()).toBe("new body");
    expect(scroller.querySelector(".ProseMirror")).toBe(editor.view.dom);
    failing.mockRestore();
    act(() => {
      handle.replaceContent("latest body", { anchor: 1, head: 4 });
    });
    expect(
      editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to
      )
    ).toBe("ate");

    const invalid = vi.spyOn(manager, "parse").mockImplementation(() => {
      throw new Error("cannot parse the document");
    });
    onTestFinished(() => {
      invalid.mockRestore();
    });
    expect(() => {
      handle.replaceContent("unreadable", { anchor: 0, head: 0 });
    }).toThrow("cannot parse the document");
    invalid.mockRestore();
    expect(handle.getContent().trimEnd()).toBe("latest body");
  });

  it("should hand the session a selection reader instead of converting on every caret move", async () => {
    const onChange = vi.fn<ComponentProps<typeof Editor>["onChange"]>();
    const onSelect =
      vi.fn<NonNullable<ComponentProps<typeof Editor>["onSelect"]>>();
    const { editor } = await mount({
      initialContent: "body",
      onChange,
      onSelect,
    });
    const manager = editor.markdown;
    if (manager === undefined) {
      throw new Error("the editor has no markdown converter");
    }
    const serialize = vi.spyOn(manager, "serialize");
    onTestFinished(() => {
      serialize.mockRestore();
    });
    onSelect.mockClear();

    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 4 });
    });
    expect(serialize).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    const moved = onSelect.mock.lastCall?.[0];
    expect(moved?.()).toStrictEqual({ anchor: 0, head: 3 });

    act(() => {
      editor.commands.insertContent("old");
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.lastCall?.[0]).toContain("oldy");
    expect(onSelect.mock.lastCall?.[0]?.()).toStrictEqual({
      anchor: 3,
      head: 3,
    });
    expect(moved?.()).toStrictEqual({ anchor: 0, head: 3 });

    onSelect.mockClear();
    cleanup();
    await waitFor(() => {
      expect(onSelect).toHaveBeenLastCalledWith(undefined);
    });
  });
});

describe("caret on mount", () => {
  it("should open at the document start and take focus when no caret is restored", async () => {
    const { editor } = await mount({
      focusOnMount: true,
      initialContent: "# title\n\nbody",
    });

    expect(editor.state.selection.from).toBe(
      Selection.atStart(editor.state.doc).from
    );
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it("should place the caret at a restored offset", async () => {
    const { editor } = await mount({
      focusOnMount: true,
      initialContent: `# title\n\nbo${SENTINEL}dy`,
      stripSentinel: true,
    });

    expect(editor.getText()).not.toContain(SENTINEL);
    expect(editor.state.selection.$from.parent.textContent).toBe("body");
    expect(editor.state.selection.$from.parentOffset).toBe(2);
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it("should leave a background tab unfocused at the document start", async () => {
    const { editor } = await mount({
      focusOnMount: false,
      initialContent: "# title\n\nbody",
    });

    expect(editor.state.selection.from).toBe(
      Selection.atStart(editor.state.doc).from
    );
    expect(document.activeElement).not.toBe(editor.view.dom);
  });

  it("should keep a restored caret when StrictMode replays the mount", async () => {
    const handles: EditorHandle[] = [];
    const { container } = render(
      createElement(
        StrictMode,
        null,
        createElement(Editor, {
          focusOnMount: true,
          initialContent: `# title\n\nbo${SENTINEL}dy`,
          onChange: () => {},
          onReady: (ready) => {
            handles.push(ready);
          },
          stripSentinel: true,
        })
      )
    );
    await waitFor(() => {
      expect(handles).toHaveLength(1);
    });
    const surface = container.querySelector(".ProseMirror");
    if (
      surface === null ||
      !("editor" in surface) ||
      !(surface.editor instanceof TiptapEditor)
    ) {
      throw new Error("the editor did not mount");
    }
    const { editor } = surface;

    expect(editor.getText()).not.toContain(SENTINEL);
    expect(editor.state.selection.$from.parent.textContent).toBe("body");
    expect(editor.state.selection.$from.parentOffset).toBe(2);
  });
});
