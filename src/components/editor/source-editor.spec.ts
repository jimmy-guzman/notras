import { Editor as TiptapEditor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNoteDocument } from "@/components/editor/note-document";
import type { SourceEditorHandle } from "@/components/editor/source-editor";
import { SourceEditor } from "@/components/editor/source-editor";

// React requires this flag for a root driven by act outside a browser runner.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let teardown: (() => void) | null = null;

afterEach(() => {
  teardown?.();
  teardown = null;
});

/**
 * Mount the editor beside an already-focused button. The caret lands in a mount
 * effect, so the render has to be flushed before focus is read.
 */
const mountBeside = async (focusOnMount: boolean) => {
  const button = document.createElement("button");
  const host = document.createElement("div");

  document.body.append(button, host);
  button.focus();

  const root = createRoot(host);
  const note = createNoteDocument("---\npinned: true\n---\n# a title", "a.md");

  await act(async () => {
    root.render(
      createElement(SourceEditor, {
        editor: note.editor,
        focusOnMount,
      })
    );
    await Promise.resolve();
  });

  teardown = () => {
    act(() => {
      root.unmount();
    });
    note.destroy();
    button.remove();
    host.remove();
  };

  return { button, host };
};

describe("source editor focus", () => {
  it("should patch both title fields without replacing source selection or undo history", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const source = "---\ntitle: old\n---\n# old\nbody";
    const note = createNoteDocument(source, "old.md");
    const handles: SourceEditorHandle[] = [];
    await act(() => {
      root.render(
        createElement(SourceEditor, {
          editor: note.editor,
          initialCursor: source.length,
          onReady: (ready) => handles.push(ready),
        })
      );
    });
    teardown = () => {
      act(() => root.unmount());
      note.destroy();
      host.remove();
    };
    await act(async () => {
      await vi.waitFor(() => expect(handles.length).toBe(1));
    });
    const [handle] = handles;
    const surface = host.querySelector(".ProseMirror");
    if (
      handle === undefined ||
      surface === null ||
      !("editor" in surface) ||
      !(surface.editor instanceof TiptapEditor)
    ) {
      throw new Error("the source editor did not mount");
    }
    const { editor } = surface;
    act(() => {
      handle.insertText(" plus typing");
    });
    act(() => {
      editor.view.dispatch(
        editor.state.tr
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
    expect(surface.textContent).toBe(expected);
    expect(handle.getCursorOffset()).toBe(expected.length);
    expect(host.querySelector(".ProseMirror")).toBe(surface);
    act(() => {
      editor.commands.undo();
    });
    expect(surface.textContent).toBe(
      "---\ntitle: longer title\n---\n# longer title\nbody"
    );
  });
  it("should leave focus alone when it is not the active surface", async () => {
    const { button } = await mountBeside(false);

    expect(document.activeElement).toBe(button);
  });

  it("should take focus when mounted as the active surface", async () => {
    const { host } = await mountBeside(true);

    expect(document.activeElement).toBe(host.querySelector(".ProseMirror"));
  });
});

it("should retain source text and caret while highlighting and inserting text", async ({
  onTestFinished,
}) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const changes: string[] = [];
  let handle: SourceEditorHandle | undefined;
  const source =
    "---\npinned: true\n...\n# a title\n\n```ts\nconst value = 1;\n```";
  const note = createNoteDocument(source, "a.md", () =>
    changes.push(note.content())
  );
  onTestFinished(() => {
    act(() => root.unmount());
    note.destroy();
    container.remove();
  });

  await act(() => {
    root.render(
      createElement(SourceEditor, {
        editor: note.editor,
        initialCursor: 4,
        onReady: (ready) => {
          handle = ready;
        },
      })
    );
  });
  await act(async () => {
    await vi.waitFor(() => {
      expect(handle).toBeDefined();
      expect(container.querySelector(".syntax-token")).not.toBeNull();
    });
  });

  if (handle === undefined) {
    throw new Error("source editor did not become ready");
  }
  expect(container.querySelector("pre")?.textContent).toBe(source);
  expect(handle.getCursorOffset()).toBe(4);
  expect(changes).toEqual([]);

  act(() => handle?.insertText("# a comment\n"));
  expect(changes).toEqual([
    "---\n# a comment\npinned: true\n...\n# a title\n\n```ts\nconst value = 1;\n```",
  ]);
  expect(handle.getCursorOffset()).toBe(16);
});

it("should release find navigation when its view detaches and search again after remount", async () => {
  const note = createNoteDocument("needle needle", "a.md");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const handles: SourceEditorHandle[] = [];
  await act(() =>
    root.render(
      createElement(SourceEditor, {
        editor: note.editor,
        onReady: (handle) => handles.push(handle),
      })
    )
  );
  const [first] = handles;
  if (first === undefined) {
    throw new Error("source did not mount");
  }
  act(() => first.find.setQuery("needle"));
  expect(first.find.snapshot().total).toBe(2);
  act(() => root.render(null));
  expect(first.find.alive()).toBe(false);
  expect(() => first.find.navigate(1)).not.toThrow();
  await act(() =>
    root.render(
      createElement(SourceEditor, {
        editor: note.editor,
        onReady: (handle) => handles.push(handle),
      })
    )
  );
  const second = handles.at(-1);
  expect(second?.find.alive()).toBe(true);
  act(() => second?.find.setQuery("needle"));
  expect(second?.find.snapshot().total).toBe(2);
  act(() => root.unmount());
  note.destroy();
  host.remove();
});
