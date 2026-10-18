import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { describe, expect, it } from "vitest";

import { createEditorExtensions } from "./extensions";

const WIDE_TABLE =
  "| a | b | c | d | e | f | g | h |\n| - | - | - | - | - | - | - | - |\n| one | two | three | four | five | six | seven | eight |\n\nafter";

/**
 * A table and a paragraph after it, mounted the way the app mounts them, with
 * the caret in the paragraph and the table's viewport reporting more content
 * than room, since happy-dom lays nothing out.
 */
async function mountWideTable() {
  const editor = new Editor({
    content: WIDE_TABLE,
    contentType: "markdown",
    extensions: createEditorExtensions({}),
  });

  await act(async () => {
    render(<EditorContent editor={editor} />);
    editor.commands.focus("end");
  });

  const viewport =
    editor.view.dom.querySelector<HTMLElement>(".table-viewport");

  if (viewport === null) {
    throw new Error("the table has no viewport");
  }

  Object.defineProperty(viewport, "scrollWidth", { value: 1200 });
  Object.defineProperty(viewport, "clientWidth", { value: 600 });
  Object.defineProperty(viewport, "scrollHeight", { value: 40 });
  Object.defineProperty(viewport, "clientHeight", { value: 40 });

  return { editor, viewport };
}

const scrollbarOf = (editor: Editor) =>
  editor.view.dom.querySelector(
    '[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]'
  );

describe("table scrollbar", () => {
  it("should show the bar for a sideways scroll that follows a keystroke", async () => {
    const { editor, viewport } = await mountWideTable();

    // Only the scroll is explicit: happy-dom has no layout for the key to move.
    await userEvent.setup().keyboard("{ArrowUp}");
    await act(async () => {
      viewport.scrollLeft = 120;
      viewport.dispatchEvent(new Event("scroll"));
    });

    expect(scrollbarOf(editor)).toHaveAttribute("data-scrolling");
    editor.destroy();
  });

  it("should keep the bar hidden for a scroll no one asked for", async () => {
    const { editor, viewport } = await mountWideTable();

    await act(async () => {
      viewport.scrollLeft = 120;
      viewport.dispatchEvent(new Event("scroll"));
    });

    expect(scrollbarOf(editor)).not.toHaveAttribute("data-scrolling");
    editor.destroy();
  });
});
