import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
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

import {
  createEditorExtensions,
  serializeMarkdown,
} from "@/components/editor/extensions";
import { SENTINEL } from "@/components/editor/sentinel";
import { Toaster } from "@/components/ui/toast";

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

/** Deliver the pointer target and resolved position that ProseMirror supplies without relying on happy-dom layout. */
function clickAt(
  editor: TiptapEditor,
  target: Element,
  pos: number,
  nodePos: number
) {
  const node = editor.state.doc.nodeAt(nodePos);
  if (node === null) {
    throw new Error("the clicked node does not exist");
  }

  const event = new MouseEvent("mouseup", { bubbles: true });
  fireEvent(target, event);

  return Boolean(
    editor.view.someProp("handleClickOn", (handler) =>
      handler(editor.view, pos, node, nodePos, event, true)
    )
  );
}

describe("link clicks", () => {
  it.each(["[note](other.md)", "[note](other.md) following text"])(
    "should leave caret placement to the editor when clicking after a link in %s",
    async (initialContent) => {
      const onNoteLinkClick = vi.fn<(href: string) => void>();
      const { editor } = await mount({ initialContent, onNoteLinkClick });
      const paragraph = screen.getByRole("paragraph");

      expect(clickAt(editor, paragraph, 5, 0)).toBeFalsy();
      expect(onNoteLinkClick).not.toHaveBeenCalled();
    }
  );

  it.each([1, 3, 5])(
    "should open a directly clicked link at text position %s",
    async (pos) => {
      const onNoteLinkClick = vi.fn<(href: string) => void>();
      const { editor } = await mount({
        initialContent: "[note](other.md)",
        onNoteLinkClick,
      });

      expect(clickAt(editor, screen.getByRole("link"), pos, 1)).toBeTruthy();
      expect(onNoteLinkClick).toHaveBeenCalledExactlyOnceWith("other.md");
    }
  );

  it("should open a link when clicking its formatted text", async () => {
    const onNoteLinkClick = vi.fn<(href: string) => void>();
    const { editor } = await mount({
      initialContent: "[**note**](other.md)",
      onNoteLinkClick,
    });

    expect(clickAt(editor, screen.getByText("note"), 3, 1)).toBeTruthy();
    expect(onNoteLinkClick).toHaveBeenCalledExactlyOnceWith("other.md");
  });

  it("should open the clicked destination where two links meet", async () => {
    const onNoteLinkClick = vi.fn<(href: string) => void>();
    const { editor } = await mount({
      initialContent: "[first](first.md)[second](second.md)",
      onNoteLinkClick,
    });

    expect(
      clickAt(editor, screen.getByRole("link", { name: "second" }), 6, 6)
    ).toBeTruthy();
    expect(onNoteLinkClick).toHaveBeenCalledExactlyOnceWith("second.md");
  });

  it("should open a clicked wikilink pill", async () => {
    const onWikilinkClick = vi.fn<(title: string) => void>();
    const { editor } = await mount({
      initialContent: "[[other]]",
      onWikilinkClick,
    });

    expect(clickAt(editor, screen.getByText("other"), 1, 1)).toBeTruthy();
    expect(onWikilinkClick).toHaveBeenCalledExactlyOnceWith("other");
  });

  it("should leave caret placement to the editor beside a wikilink pill", async () => {
    const onWikilinkClick = vi.fn<(title: string) => void>();
    const { editor } = await mount({
      initialContent: "[[other]]",
      onWikilinkClick,
    });

    expect(clickAt(editor, screen.getByRole("paragraph"), 2, 1)).toBeFalsy();
    expect(onWikilinkClick).not.toHaveBeenCalled();
  });

  it("should open a directly clicked relative file link", async () => {
    const onFileLinkClick = vi.fn<(href: string) => void>();
    const { editor } = await mount({
      initialContent: "[report](attachments/report.pdf)",
      onFileLinkClick,
    });

    expect(clickAt(editor, screen.getByRole("link"), 3, 1)).toBeTruthy();
    expect(onFileLinkClick).toHaveBeenCalledExactlyOnceWith(
      "attachments/report.pdf"
    );
  });

  it("should open an external URL through the native opener and prevent browser navigation", async () => {
    const invoke = vi.fn<Parameters<typeof mockIPC>[0]>();
    mockIPC(invoke);
    onTestFinished(clearMocks);
    const { editor } = await mount({
      initialContent: "[site](https://example.com)",
    });
    const anchor = screen.getByRole("link");

    expect(clickAt(editor, anchor, 3, 1)).toBeTruthy();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("plugin:opener|open_url", {
      openWith: undefined,
      url: "https://example.com",
    });
    expect(fireEvent.click(anchor)).toBeFalsy();
  });

  it("should refuse an unsafe link and prevent browser navigation", async () => {
    const invoke = vi.fn<Parameters<typeof mockIPC>[0]>();
    mockIPC(invoke);
    onTestFinished(clearMocks);
    render(<Toaster />);
    const { editor } = await mount({
      initialContent: "[refused](vscode://file/tmp)",
    });
    const anchor = screen.getByText("refused");

    act(() => {
      expect(clickAt(editor, anchor, 4, 1)).toBeTruthy();
    });

    expect(anchor).toHaveAttribute("href", "");
    expect(
      await screen.findByText("That link uses a scheme notras will not open")
    ).toBeVisible();
    expect(screen.getByText("could not open link")).toBeVisible();
    expect(invoke).not.toHaveBeenCalled();
    expect(fireEvent.click(anchor)).toBeFalsy();
  });
});

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

describe("link hover", () => {
  it.each(["[note](other.md)", "[[note]]"])(
    "should wait 300 ms before showing the edit preview for %s",
    async (initialContent) => {
      await mount({ initialContent, resolveWikilink: () => "other.md" });
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });

      fireEvent.mouseOver(screen.getByText("note"));
      expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(screen.getByRole("button", { name: "edit link" })).toBeVisible();
      expect(screen.getByText("other.md")).toBeVisible();
    }
  );

  it("should cancel a pending preview when the pointer leaves", async () => {
    await mount({ initialContent: "[note](other.md)" });
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const anchor = screen.getByRole("link");

    fireEvent.mouseOver(anchor);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseOut(anchor);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
  });

  it.each([100, 300])(
    "should dismiss the preview on a press after %s ms and still open the link",
    async (elapsed) => {
      const onNoteLinkClick = vi.fn<(href: string) => void>();
      const { editor } = await mount({
        initialContent: "[note](other.md)",
        onNoteLinkClick,
      });
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const anchor = screen.getByRole("link");

      fireEvent.mouseOver(anchor);
      act(() => {
        vi.advanceTimersByTime(elapsed);
      });
      fireEvent.mouseDown(anchor);
      expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
      act(() => {
        clickAt(editor, anchor, 3, 1);
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
      expect(onNoteLinkClick).toHaveBeenCalledExactlyOnceWith("other.md");
    }
  );

  it("should start a fresh delay and clear the old preview when entering another link", async () => {
    await mount({ initialContent: "[first](first.md)[second](second.md)" });
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const first = screen.getByRole("link", { name: "first" });
    const second = screen.getByRole("link", { name: "second" });

    fireEvent.mouseOver(first);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("first.md")).toBeVisible();
    fireEvent.mouseOut(first, { relatedTarget: second });
    fireEvent.mouseOver(second, { relatedTarget: first });
    expect(screen.queryByText("first.md")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByText("second.md")).toBeVisible();
  });

  it("should keep the original deadline when moving between formatted parts of a link", async () => {
    await mount({ initialContent: "[**bold** *italic*](other.md)" });
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const bold = screen.getByText("bold");
    const italic = screen.getByText("italic");

    fireEvent.mouseOver(bold);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.mouseOut(bold, { relatedTarget: italic });
    fireEvent.mouseOver(italic, { relatedTarget: bold });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByRole("button", { name: "edit link" })).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByRole("button", { name: "edit link" })).toBeVisible();
  });

  it("should keep the preview reachable across the gap and open its link editor", async () => {
    await mount({ initialContent: "[note](other.md)" });
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const anchor = screen.getByRole("link");

    fireEvent.mouseOver(anchor);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const edit = screen.getByRole("button", { name: "edit link" });
    fireEvent.mouseOut(anchor);
    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(edit).toBeVisible();
    fireEvent.mouseOver(edit);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(edit).toBeVisible();
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(edit);

    expect(screen.getByRole("textbox", { name: "link text" })).toHaveValue(
      "note"
    );
    expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
  });

  it("should close the preview 150 ms after leaving it", async () => {
    await mount({ initialContent: "[note](other.md)" });
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const anchor = screen.getByRole("link");

    fireEvent.mouseOver(anchor);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.mouseOut(anchor);
    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(screen.getByRole("button", { name: "edit link" })).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
  });

  it.each(["hidden", "inert"])(
    "should discard a pending preview when its surface becomes %s",
    async (attribute) => {
      const { scroller } = await mount({ initialContent: "[note](other.md)" });
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });

      fireEvent.mouseOver(screen.getByRole("link"));
      scroller.setAttribute(attribute, "");
      act(() => {
        vi.advanceTimersByTime(300);
      });
      scroller.removeAttribute(attribute);

      expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
    }
  );

  it("should discard a pending preview when its link is removed", async () => {
    const { handle } = await mount({ initialContent: "[note](other.md)" });
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    fireEvent.mouseOver(screen.getByRole("link"));
    act(() => {
      handle.replaceContent("plain text");
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
  });

  it("should discard a pending preview when the editor is destroyed", async () => {
    const { editor } = await mount({ initialContent: "[note](other.md)" });
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    fireEvent.mouseOver(screen.getByRole("link"));
    act(() => {
      editor.destroy();
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
  });

  it("should cancel a pending preview when following a link by keyboard", async () => {
    const onNoteLinkClick = vi.fn<(href: string) => void>();
    const { editor } = await mount({
      initialContent: "[note](other.md)",
      onNoteLinkClick,
    });
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    act(() => {
      editor.commands.setTextSelection(3);
    });

    fireEvent.mouseOver(screen.getByRole("link"));
    act(() => {
      vi.advanceTimersByTime(100);
      editor.commands.keyboardShortcut("Mod-Shift-o");
      vi.advanceTimersByTime(300);
    });

    expect(onNoteLinkClick).toHaveBeenCalledExactlyOnceWith("other.md");
    expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
  });

  it("should not revive a pending preview after opening and closing the link editor", async () => {
    const { editor } = await mount({ initialContent: "[note](other.md)" });
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    act(() => {
      editor.commands.setTextSelection(3);
    });

    fireEvent.mouseOver(screen.getByRole("link"));
    act(() => {
      vi.advanceTimersByTime(100);
      editor.commands.keyboardShortcut("Mod-Shift-k");
    });
    const text = screen.getByRole("textbox", { name: "link text" });
    expect(text).toHaveValue("note");
    fireEvent.keyDown(text, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByRole("button", { name: "edit link" })).toBeNull();
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
    ["named", "```ts\nconst value = 1;\n```", "const value = 1;"],
    ["plain", "```\nplain code\n```", "plain code"],
    ["unknown language", "```mermaid\ngraph TD\n```", "graph TD"],
    ["empty", "```ts\n\n```", ""],
    [
      "nested fences",
      "````markdown\n```ts\nconst value = 1;\n```\n````",
      "```ts\nconst value = 1;\n```",
    ],
  ])(
    "should copy a %s code block as its code",
    async (_name, markdown, code) => {
      await mount({ initialContent: markdown });
      const user = userEvent.setup();
      const copy = screen.getByRole("button", { name: "copy code" });

      await user.click(copy);

      await expect(navigator.clipboard.readText()).resolves.toBe(code);
      expect(copy.textContent).toBe("copied");
    }
  );

  it("should save the newly selected language in markdown", async () => {
    const { handle } = await mount({
      initialContent: "```mermaid\ngraph TD\n```",
    });
    const user = userEvent.setup();
    const language = screen.getByRole<HTMLSelectElement>("combobox", {
      name: "code language",
    });

    expect(language.value).toBe("mermaid");
    expect(language.options).toHaveLength(1);
    await user.hover(language);
    expect(language.options.length).toBeGreaterThan(1);
    await user.selectOptions(language, "typescript");

    expect(language.value).toBe("typescript");
    expect(handle.getContent().trimEnd()).toBe("```typescript\ngraph TD\n```");

    await user.selectOptions(language, "");

    expect(handle.getContent().trimEnd()).toBe("```\ngraph TD\n```");
  });
});

/** The document range holding `text`, for selecting words the way a user would. */
function rangeOf(editor: TiptapEditor, text: string) {
  const ranges: { from: number; to: number }[] = [];

  editor.state.doc.descendants((node, pos) => {
    const index = node.text?.indexOf(text) ?? -1;

    if (index !== -1) {
      ranges.push({ from: pos + index, to: pos + index + text.length });
    }
  });

  const [range] = ranges;

  if (range === undefined) {
    throw new Error(`the document has no "${text}"`);
  }

  return range;
}

/**
 * A native event: user-event copies the DOM selection it tracks itself, and
 * ProseMirror writes the clipboard from its own.
 */
function copyBetween(editor: TiptapEditor, from: number, to: number) {
  const clipboardData = new DataTransfer();

  act(() => {
    editor.commands.setTextSelection({ from, to });
  });
  editor.view.dom.dispatchEvent(
    new ClipboardEvent("copy", {
      bubbles: true,
      cancelable: true,
      clipboardData,
    })
  );

  return clipboardData;
}

describe("copy", () => {
  it.each([
    [
      "words in a list item",
      "- first words\n- second",
      "words",
      "words",
      "words",
    ],
    [
      "link text",
      "see [the site](https://example.com) now",
      "the site",
      "the site",
      "the site",
    ],
    ["bold text", "**bold** text", "bold", "text", "bold text"],
    ["a heading", "## heading text", "heading", "text", "heading text"],
    [
      "a table cell",
      "| a | b |\n| --- | --- |\n| cell | x |",
      "cell",
      "cell",
      "cell",
    ],
    [
      "a line of code",
      "```ts\nconst a = 1;\nconst b = 2;\n```",
      "const b",
      "2;",
      "const b = 2;",
    ],
    [
      "a wikilink",
      "see [[Other note]] here",
      "see",
      "here",
      "see Other note here",
    ],
    ["an image", "a ![pic](attachments/x.png) b", "a", "b", "a pic b"],
  ])(
    "should copy %s as the text it shows",
    async (_name, initialContent, first, last, text) => {
      const { editor } = await mount({ initialContent });
      const copied = copyBetween(
        editor,
        rangeOf(editor, first).from,
        rangeOf(editor, last).to
      );

      expect(copied.getData("text/plain")).toBe(text);
    }
  );

  it("should copy a selection across list items as markdown", async () => {
    const { editor } = await mount({ initialContent: "- a\n- b" });
    const copied = copyBetween(
      editor,
      rangeOf(editor, "a").from,
      rangeOf(editor, "b").to
    );

    expect(copied.getData("text/plain")).toBe("- a\n- b");
  });

  it.each([
    [1, "a\n\n\n\nb"],
    [2, "a\n\n\n\n\n\nb"],
    [3, "a\n\n\n\n\n\n\n\nb"],
  ])(
    "should copy %i blank paragraphs as that many blank blocks",
    async (blanks, text) => {
      const { editor } = await mount({ initialContent: "a" });

      act(() => {
        editor.commands.setContent({
          content: [
            { content: [{ text: "a", type: "text" }], type: "paragraph" },
            ...Array.from({ length: blanks }, () => ({ type: "paragraph" })),
            { content: [{ text: "b", type: "text" }], type: "paragraph" },
          ],
          type: "doc",
        });
      });

      const copied = copyBetween(
        editor,
        rangeOf(editor, "a").from,
        rangeOf(editor, "b").to
      );

      expect(copied.getData("text/plain")).toBe(text);
    }
  );

  it("should copy an image by its path in the notes folder rather than the app's URL", async () => {
    const { editor, scroller } = await mount({
      initialContent: "a ![pic](attachments/x.png) b",
      resolveImageSrc: (src) => `asset://localhost/notes/${src}`,
    });
    const copied = copyBetween(
      editor,
      rangeOf(editor, "a").from,
      rangeOf(editor, "b").to
    );

    expect(scroller.querySelector("img")?.getAttribute("src")).toBe(
      "asset://localhost/notes/attachments/x.png"
    );
    expect(copied.getData("text/html")).toContain('src="attachments/x.png"');
    expect(copied.getData("text/html")).not.toContain("asset://");
  });

  it.each([
    ["the notes root", "b.md", "attachments/x.png"],
    ["a folder", "projects/b.md", "../attachments/x.png"],
    ["a nested folder", "projects/deep/b.md", "../../attachments/x.png"],
  ])(
    "should keep an image copied from a folder showing when pasted into a note in %s",
    async (_name, target, destination) => {
      const { editor } = await mount({
        documentPath: () => "projects/a.md",
        initialContent: "a ![pic](../attachments/x.png) b",
      });
      const copied = copyBetween(
        editor,
        rangeOf(editor, "a").from,
        rangeOf(editor, "b").to
      );
      const { editor: pasted, handle } = await mount({
        documentPath: () => target,
        initialContent: "",
      });

      pasted.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: copied })
      );

      expect(handle.getContent().trimEnd()).toBe(`a ![pic](${destination}) b`);
    }
  );

  it.each([
    ["words from a list item", "- first words", "words", "words", "words"],
    [
      "a link",
      "see [the site](https://example.com)",
      "the site",
      "the site",
      "[the site](https://example.com)",
    ],
    [
      "a wikilink",
      "see [[Other note]] here",
      "see",
      "here",
      "see [[Other note]] here",
    ],
  ])(
    "should paste %s copied from a note as they read",
    async (_name, initialContent, first, last, markdown) => {
      const { editor } = await mount({ initialContent });
      const copied = copyBetween(
        editor,
        rangeOf(editor, first).from,
        rangeOf(editor, last).to
      );
      const pasted = new TiptapEditor({
        content: "",
        extensions: createEditorExtensions({}),
      });

      pasted.view.dom.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: copied })
      );

      expect(serializeMarkdown(pasted)).toBe(markdown);
      pasted.destroy();
    }
  );
});

function pasteImage(editor: TiptapEditor) {
  const clipboardData = new DataTransfer();

  clipboardData.items.add(
    new File([new Uint8Array([137, 80, 78, 71])], "shot.png", {
      type: "image/png",
    })
  );
  act(() => {
    editor.view.dom.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      })
    );
  });
}

describe("image paste", () => {
  it("should place the image where it was pasted after the note changes while it saves", async () => {
    const saved = Promise.withResolvers<string>();
    mockIPC(async (command) =>
      command === "attach_image" ? await saved.promise : null
    );
    onTestFinished(clearMocks);
    const { editor, handle } = await mount({ initialContent: "before after" });

    act(() => {
      editor.commands.setTextSelection(rangeOf(editor, "after").from);
    });
    pasteImage(editor);
    act(() => {
      editor.commands.insertContentAt(1, "new ");
      editor.commands.setTextSelection(1);
    });
    saved.resolve("attachments/pasted-1.png");

    await waitFor(() => {
      expect(handle.getContent().trimEnd()).toBe(
        "new before ![](attachments/pasted-1.png)after"
      );
    });
  });

  it("should refuse an image pasted inside code", async () => {
    const invoke = vi.fn<Parameters<typeof mockIPC>[0]>();
    mockIPC(invoke);
    onTestFinished(clearMocks);
    render(<Toaster />);
    const { editor, handle } = await mount({
      initialContent: "```\ncode\n```",
    });

    act(() => {
      editor.commands.setTextSelection(rangeOf(editor, "de").from);
    });
    pasteImage(editor);

    await expect(
      screen.findByText("An image cannot go inside code")
    ).resolves.toBeDefined();
    expect(handle.getContent().trimEnd()).toBe("```\ncode\n```");
    expect(invoke).not.toHaveBeenCalled();
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
