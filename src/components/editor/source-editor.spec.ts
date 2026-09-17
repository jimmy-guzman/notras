import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { createNoteDocument } from "@/components/editor/note-document";
import { SourceEditor } from "@/components/editor/source-editor";
import type { SourceEditorHandle } from "@/components/editor/source-editor";

describe("focus through the handle", () => {
  it("should keep the viewport where it was when focus reveals the caret", ({
    onTestFinished,
  }) => {
    const note = createNoteDocument("# title\n\nbody", "note.md");
    onTestFinished(() => {
      note.destroy();
    });
    const handles: SourceEditorHandle[] = [];
    const { container } = render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: false,
        onReady: (ready) => {
          handles.push(ready);
        },
      })
    );
    const [handle] = handles;
    const viewport = container.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (handle === undefined || viewport === null) {
      throw new Error("source editor missing");
    }
    // Fakes WebKit at the DOM boundary: focus reads `preventScroll` the way a
    // supporting engine does and still scrolls the caret into view inside the
    // call. ProseMirror decides once per module, on its first focus, whether
    // the engine honors the option, so this runs before any other focus here.
    Object.defineProperty(note.editor.view.dom, "focus", {
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

    expect(document.activeElement).toBe(note.editor.view.dom);
    expect(viewport.scrollTop).toBe(120);
  });
});

describe("source editor focus", () => {
  it("should patch both title fields without replacing source selection or undo history", ({
    onTestFinished,
  }) => {
    const source = "---\ntitle: old\n---\n# old\nbody";
    const note = createNoteDocument(source, "old.md");
    onTestFinished(() => {
      note.destroy();
    });
    const handles: SourceEditorHandle[] = [];
    const { container } = render(
      createElement(SourceEditor, {
        editor: note.editor,
        initialCursor: source.length,
        onReady: (ready) => {
          handles.push(ready);
        },
      })
    );
    const [handle] = handles;
    if (handle === undefined) {
      throw new Error("source editor missing");
    }
    const surface = container.querySelector(".ProseMirror");
    expect(surface).toBeInTheDocument();
    act(() => {
      handle.insertText(" plus typing");
    });
    act(() => {
      note.editor.view.dispatch(
        note.editor.state.tr
          .insertText(
            "---\ntitle: longer title\n---\n# longer title\n",
            1,
            source.indexOf("body") + 1
          )
          .setMeta("addToHistory", false)
      );
    });
    const expected =
      "---\ntitle: longer title\n---\n# longer title\nbody plus typing";
    expect(surface?.textContent).toBe(expected);
    expect(handle.getCursorOffset()).toBe(expected.length);
    expect(container.querySelector(".ProseMirror")).toBe(surface);
    act(() => {
      note.editor.commands.undo();
    });
    expect(surface?.textContent).toBe(
      "---\ntitle: longer title\n---\n# longer title\nbody"
    );
  });

  it("should leave focus alone when it is not the active surface", ({
    onTestFinished,
  }) => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    const note = createNoteDocument(
      "---\npinned: true\n---\n# a title",
      "a.md"
    );
    onTestFinished(() => {
      note.destroy();
      button.remove();
    });
    render(
      createElement(SourceEditor, { editor: note.editor, focusOnMount: false })
    );
    expect(button).toHaveFocus();
  });

  it("should take focus when mounted as the active surface", async ({
    onTestFinished,
  }) => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    const note = createNoteDocument(
      "---\npinned: true\n---\n# a title",
      "a.md"
    );
    onTestFinished(() => {
      note.destroy();
      button.remove();
    });
    const { container } = render(
      createElement(SourceEditor, { editor: note.editor, focusOnMount: true })
    );
    await waitFor(() =>
      expect(container.querySelector(".ProseMirror")).toHaveFocus()
    );
  });
});

describe("source editor", () => {
  it("should break the line on shift+enter", ({ onTestFinished }) => {
    const note = createNoteDocument("one two", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount: true,
        initialCursor: 3,
      })
    );

    // A native event: ProseMirror swallows Enter by its keyCode, which
    // user-event leaves at 0, so the key would land through the DOM instead.
    fireEvent.keyDown(note.editor.view.dom, {
      key: "Enter",
      keyCode: 13,
      shiftKey: true,
    });

    expect(note.content()).toBe("one\n two");
  });

  it("should retain source text and caret while highlighting and inserting text", async ({
    onTestFinished,
  }) => {
    const changes: string[] = [];
    const handles: SourceEditorHandle[] = [];
    const source =
      "---\npinned: true\n...\n# a title\n\n```ts\nconst value = 1;\n```";
    const note = createNoteDocument(source, "a.md", () => {
      changes.push(note.content());
    });
    onTestFinished(() => {
      note.destroy();
    });
    const { container } = render(
      createElement(SourceEditor, {
        editor: note.editor,
        initialCursor: 4,
        onReady: (ready) => {
          handles.push(ready);
        },
      })
    );
    await waitFor(() =>
      expect(container.querySelector(".syntax-token")).toBeInTheDocument()
    );
    const [handle] = handles;
    if (handle === undefined) {
      throw new Error("source editor missing");
    }
    expect(container.querySelector("pre")?.textContent).toBe(source);
    expect(handle.getCursorOffset()).toBe(4);
    expect(changes).toStrictEqual([]);
    act(() => {
      handle.insertText("# a comment\n");
    });
    expect(changes).toStrictEqual([
      "---\n# a comment\npinned: true\n...\n# a title\n\n```ts\nconst value = 1;\n```",
    ]);
    expect(handle.getCursorOffset()).toBe(16);
  });

  it("should release find navigation when its view detaches and search again after remount", ({
    onTestFinished,
  }) => {
    const note = createNoteDocument("needle needle", "a.md");
    onTestFinished(() => {
      note.destroy();
    });
    const handles: SourceEditorHandle[] = [];
    const { rerender } = render(
      createElement(SourceEditor, {
        editor: note.editor,
        onReady: (handle) => {
          handles.push(handle);
        },
      })
    );
    const [first] = handles;
    if (first === undefined) {
      throw new Error("source did not mount");
    }
    act(() => {
      first.find.setQuery("needle");
    });
    expect(first.find.snapshot().total).toBe(2);
    rerender(null);
    expect(first.find.alive()).toBeFalsy();
    expect(() => {
      first.find.navigate(1);
    }).not.toThrow();
    rerender(
      createElement(SourceEditor, {
        editor: note.editor,
        onReady: (handle) => {
          handles.push(handle);
        },
      })
    );
    const second = handles.at(-1);
    expect(second?.find.alive()).toBeTruthy();
    act(() => second?.find.setQuery("needle"));
    expect(second?.find.snapshot().total).toBe(2);
  });
});
