import { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { DragGhost } from "./drag-ghost";
import { createEditorExtensions } from "./extensions";

/** The stack `move-selection.spec.ts` builds, so a real view produces the DOM. */
function load(markdown: string) {
  const editor = new Editor({
    content: markdown,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });

  editor.state.doc.check();

  return editor;
}

function positionsOf(doc: Node, type: string) {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === type) {
      positions.push(pos);
    }

    return true;
  });

  return positions;
}

function ghostFor(markdown: string, type: string, take = positionsOf) {
  const editor = load(markdown);
  const ghost = DragGhost.ofBlocks(
    editor.view,
    take(editor.state.doc, type),
    0,
    0
  );
  const element = document.querySelector(".drag-ghost");

  if (element === null) {
    throw new Error("the ghost is not on the body");
  }

  return { editor, element, ghost };
}

describe("DragGhost", () => {
  it("should keep a task item a row rather than a bare item", () => {
    // The row recipe is reached through the list, so an item travelling without
    // one drops its checkbox to a line of its own.
    const { editor, element, ghost } = ghostFor("- [x] one", "taskItem");
    const rows = element.querySelectorAll('ul[data-type="taskList"] > li');

    ghost.destroy();
    editor.destroy();

    expect(rows).toHaveLength(1);
  });

  it("should carry sibling items in one list", () => {
    // Two lists would put a list's margins between rows that had none.
    const { editor, element, ghost } = ghostFor(
      "- [ ] one\n- [ ] two",
      "taskItem"
    );
    const lists = element.querySelectorAll('ul[data-type="taskList"]');
    const rows = element.querySelectorAll('ul[data-type="taskList"] > li');

    ghost.destroy();
    editor.destroy();

    expect(lists).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });

  it("should keep the number an ordered item was dragged from", () => {
    const { editor, element, ghost } = ghostFor(
      "1. one\n2. two",
      "listItem",
      (doc, type) => positionsOf(doc, type).slice(1)
    );
    const list = element.querySelector("ol");

    ghost.destroy();
    editor.destroy();

    expect(list?.start).toBe(2);
  });

  it("should give a table row a table to render in", () => {
    const { editor, element, ghost } = ghostFor(
      "| a | b |\n| - | - |\n| one | two |",
      "tableRow",
      (doc, type) => positionsOf(doc, type).slice(1)
    );
    const row = element.querySelector("table > tbody > tr");

    ghost.destroy();
    editor.destroy();

    expect(row?.textContent).toBe("onetwo");
  });

  it("should take itself off the body when the drag ends", () => {
    const { editor, ghost } = ghostFor("one", "paragraph");

    ghost.destroy();
    editor.destroy();

    expect(document.querySelector(".drag-ghost")).toBeNull();
    expect(document.body.classList.contains("dragging")).toBe(false);
  });

  it("should sit below and right of the pointer", () => {
    const { editor, element, ghost } = ghostFor("one", "paragraph");

    ghost.moveTo(100, 200);

    const transform =
      element instanceof HTMLElement ? element.style.transform : null;

    ghost.destroy();
    editor.destroy();

    expect(transform).toBe("translate3d(116px, 216px, 0)");
  });

  it("should carry the words alone, in their block's own element", () => {
    const editor = load("## one two three");
    // The heading's text starts at 1, so "two" runs from 5 to 8.
    const ghost = DragGhost.ofText(editor.view, 5, 8, 0, 0);
    const heading = document.querySelector(".drag-ghost h2");

    ghost.destroy();
    editor.destroy();

    expect(heading?.textContent).toBe("two");
  });

  it("should keep the mark around words taken from inside it", () => {
    // `cloneContents` drops the range's common ancestor, which is the mark's
    // own element when the words sit wholly inside it.
    const editor = load("**one two** three");
    const ghost = DragGhost.ofText(editor.view, 5, 8, 0, 0);
    const strong = document.querySelector(".drag-ghost strong");

    ghost.destroy();
    editor.destroy();

    expect(strong?.textContent).toBe("two");
  });
});
