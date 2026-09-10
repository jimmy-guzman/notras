import { act, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { createNoteDocument } from "@/components/editor/note-document";
import {
  SourceEditor,
  type SourceEditorHandle,
} from "@/components/editor/source-editor";

describe("source editor focus", () => {
  it("should patch both title fields without replacing source selection or undo history", ({
    onTestFinished,
  }) => {
    const source = "---\ntitle: old\n---\n# old\nbody";
    const note = createNoteDocument(source, "old.md");
    onTestFinished(() => note.destroy());
    const handles: SourceEditorHandle[] = [];
    const { container } = render(
      createElement(SourceEditor, {
        editor: note.editor,
        initialCursor: source.length,
        onReady: (ready) => handles.push(ready),
      })
    );
    const [handle] = handles;
    if (handle === undefined) {
      throw new Error("source editor missing");
    }
    const surface = container.querySelector(".ProseMirror");
    expect(surface).toBeInTheDocument();
    act(() => handle.insertText(" plus typing"));
    act(() =>
      note.editor.view.dispatch(
        note.editor.state.tr
          .insertText(
            "---\ntitle: longer title\n---\n# longer title\n",
            1,
            source.indexOf("body") + 1
          )
          .setMeta("addToHistory", false)
      )
    );
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

it("should retain source text and caret while highlighting and inserting text", async ({
  onTestFinished,
}) => {
  const changes: string[] = [];
  const handles: SourceEditorHandle[] = [];
  const source =
    "---\npinned: true\n...\n# a title\n\n```ts\nconst value = 1;\n```";
  const note = createNoteDocument(source, "a.md", () =>
    changes.push(note.content())
  );
  onTestFinished(() => note.destroy());
  const { container } = render(
    createElement(SourceEditor, {
      editor: note.editor,
      initialCursor: 4,
      onReady: (ready) => handles.push(ready),
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
  expect(changes).toEqual([]);
  act(() => handle.insertText("# a comment\n"));
  expect(changes).toEqual([
    "---\n# a comment\npinned: true\n...\n# a title\n\n```ts\nconst value = 1;\n```",
  ]);
  expect(handle.getCursorOffset()).toBe(16);
});

it("should release find navigation when its view detaches and search again after remount", ({
  onTestFinished,
}) => {
  const note = createNoteDocument("needle needle", "a.md");
  onTestFinished(() => note.destroy());
  const handles: SourceEditorHandle[] = [];
  const { rerender } = render(
    createElement(SourceEditor, {
      editor: note.editor,
      onReady: (handle) => handles.push(handle),
    })
  );
  const [first] = handles;
  if (first === undefined) {
    throw new Error("source did not mount");
  }
  act(() => first.find.setQuery("needle"));
  expect(first.find.snapshot().total).toBe(2);
  rerender(null);
  expect(first.find.alive()).toBe(false);
  expect(() => first.find.navigate(1)).not.toThrow();
  rerender(
    createElement(SourceEditor, {
      editor: note.editor,
      onReady: (handle) => handles.push(handle),
    })
  );
  const second = handles.at(-1);
  expect(second?.find.alive()).toBe(true);
  act(() => second?.find.setQuery("needle"));
  expect(second?.find.snapshot().total).toBe(2);
});
