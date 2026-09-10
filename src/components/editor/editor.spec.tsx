import { Editor as TiptapEditor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorExtensions } from "@/components/editor/extensions";

import type { EditorHandle } from "./editor";
import { Editor } from "./editor";

// `act` refuses to run without this, and no setup file exists to set it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let teardown: (() => void) | null = null;

afterEach(() => {
  teardown?.();
  teardown = null;
});

/**
 * Mount the editor and hand back its scroller div and handle. happy-dom
 * computes no CSS, so the observable seam is the class the stylesheet keys
 * off, the same seam TipTap's own `has-focus` is.
 */
const mount = async (modes: {
  focusModeEnabled?: boolean;
  initialContent?: string;
}) => {
  const host = document.createElement("div");

  document.body.append(host);

  const root = createRoot(host);
  let handle: EditorHandle | null = null;

  await act(async () => {
    root.render(
      createElement(Editor, {
        initialContent: "first\n\nsecond",
        ...modes,
        onChange: () => undefined,
        onReady: (ready) => {
          handle = ready;
        },
      })
    );
    await Promise.resolve();
  });

  // `immediatelyRender: false` creates the editor a tick after the render,
  // and the first mount in a run needs the extra flush.
  for (let flushes = 0; handle === null && flushes < 10; flushes += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each flush must land before deciding whether another is needed
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  }

  teardown = () => {
    act(() => {
      root.unmount();
    });
    host.remove();
  };

  const scroller = host.firstElementChild;

  if (!(scroller instanceof HTMLElement) || handle === null) {
    throw new Error("the editor did not mount");
  }

  return { handle: handle as EditorHandle, scroller };
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

    act(() => {
      scroller.dispatchEvent(new Event("wheel"));
    });

    expect(scroller.classList.contains("focus-mode-on")).toBe(true);
    expect(scroller.classList.contains("focus-reading")).toBe(true);
  });

  it("should restore the dim when the caret engages", async () => {
    const { handle, scroller } = await mount({ focusModeEnabled: true });

    act(() => {
      scroller.dispatchEvent(new Event("wheel"));
    });
    act(() => {
      handle.insertText("x");
    });

    expect(scroller.classList.contains("focus-reading")).toBe(false);
  });

  it("should restore the dim when a click leaves the selection alone", async () => {
    const { scroller } = await mount({ focusModeEnabled: true });
    const surface = scroller.querySelector(".ProseMirror");

    if (surface === null) {
      throw new Error("the editor surface did not render");
    }

    act(() => {
      scroller.dispatchEvent(new Event("wheel"));
    });
    act(() => {
      surface.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(scroller.classList.contains("focus-reading")).toBe(false);
  });

  it("should not track reading while focus mode is off", async () => {
    const { scroller } = await mount({ focusModeEnabled: false });

    act(() => {
      scroller.dispatchEvent(new Event("wheel"));
    });

    expect(scroller.classList.contains("focus-reading")).toBe(false);
  });
});

describe("focus mode scroller", () => {
  it("should mark the scroller while focus mode is on", async () => {
    const { scroller } = await mount({ focusModeEnabled: true });

    expect(scroller.classList.contains("focus-mode-on")).toBe(true);
  });

  it("should not mark the scroller while focus mode is off", async () => {
    const { scroller } = await mount({ focusModeEnabled: false });

    expect(scroller.classList.contains("focus-mode-on")).toBe(false);
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
      const copy = scroller.querySelector('button[aria-label="copy code"]');
      const surface = scroller.querySelector(".ProseMirror");

      if (!(copy instanceof HTMLButtonElement) || surface === null) {
        throw new Error("the code block did not render");
      }

      await act(async () => {
        copy.click();
        await Promise.resolve();
      });

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
    const { handle, scroller } = await mount({
      initialContent: "```mermaid\ngraph TD\n```",
    });
    const language = scroller.querySelector(
      'select[aria-label="code language"]'
    );
    const copy = scroller.querySelector('button[aria-label="copy code"]');

    if (
      !(
        language instanceof HTMLSelectElement &&
        copy instanceof HTMLButtonElement
      )
    ) {
      throw new Error("the code block toolbar did not render");
    }

    expect(language.value).toBe("mermaid");
    await act(async () => {
      language.value = "typescript";
      language.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      copy.click();
      await Promise.resolve();
    });

    expect(language.value).toBe("typescript");
    expect(handle.getContent().trimEnd()).toBe("```typescript\ngraph TD\n```");
    expect(await navigator.clipboard.readText()).toBe(
      "```typescript\ngraph TD\n```"
    );

    await act(async () => {
      language.value = "";
      language.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(handle.getContent().trimEnd()).toBe("```\ngraph TD\n```");
  });
});
