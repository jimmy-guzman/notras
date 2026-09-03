import { Editor } from "@tiptap/core";
import type { Node, NodeRange } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { createEditorExtensions, serializeMarkdown } from "./extensions";
import {
  collapseMove,
  dropTarget,
  moveRange,
  moveRangeByStep,
  movingRange,
} from "./move-selection";

/**
 * The same headless stack `markdown-roundtrip.spec.ts` builds, so a move is
 * asserted in the markdown a reader would find on disk. `doc.check()` runs on
 * both sides, which makes every case a schema test as well: a transaction
 * producing an illegal doc throws here rather than at the first
 * `contentMatchAt` inside a running view.
 *
 * A doc ending in a list serializes with a blank line after it, because any
 * edit at all makes the trailing node append an empty paragraph. Typing one
 * character produces the same, so it belongs to the editor rather than to a
 * move.
 */
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

/** The position just inside the nth node of `type`, in document order. */
function inside(doc: Node, type: string, nth = 0) {
  let found = -1;
  let seen = 0;

  doc.descendants((node, pos) => {
    if (node.type.name === type) {
      if (seen === nth) {
        found = pos + 1;
      }

      seen += 1;
    }

    return found === -1;
  });

  if (found === -1) {
    throw new Error(`no ${type} #${nth} in the document`);
  }

  return found;
}

/** Put the caret at `from` (through `to`), then step the selection. */
function step(markdown: string, from: number, to: number, back: boolean) {
  const editor = load(markdown);

  editor.commands.setTextSelection({ from, to });

  const tr = moveRangeByStep(editor.state, back);

  if (tr === null) {
    editor.destroy();

    return null;
  }

  editor.view.dispatch(tr);
  editor.state.doc.check();

  const output = serializeMarkdown(editor);

  editor.destroy();

  return output;
}

/** Step with the caret inside the nth node of `type`. */
function stepIn(markdown: string, type: string, nth: number, back: boolean) {
  const { doc } = load(markdown).state;
  const at = inside(doc, type, nth);

  return step(markdown, at, at, back);
}

/** The gap just past the range's next sibling, which is where a drag lands. */
function stepTargetFor(range: NodeRange) {
  const next = range.parent.maybeChild(range.endIndex);

  return next === null ? null : range.end + next.nodeSize;
}

describe("moveRangeByStep", () => {
  it("should move a paragraph below its successor", () => {
    expect(stepIn("one\n\ntwo", "paragraph", 0, false)).toBe("two\n\none");
  });

  it("should move a paragraph above its predecessor", () => {
    expect(stepIn("one\n\ntwo", "paragraph", 1, true)).toBe("two\n\none");
  });

  it("should refuse to move the first block up", () => {
    expect(stepIn("one\n\ntwo", "paragraph", 0, true)).toBeNull();
  });

  it("should refuse to move the last block down", () => {
    expect(stepIn("one\n\ntwo", "paragraph", 1, false)).toBeNull();
  });

  it("should move the bullet a caret sits in, not its paragraph", () => {
    expect(stepIn("- a\n- b", "listItem", 0, false)).toBe("- b\n- a\n\n");
  });

  it("should carry a nested sublist with its item", () => {
    expect(stepIn("- a\n  - a1\n- b", "listItem", 0, false)).toBe(
      "- b\n- a\n  - a1\n\n"
    );
  });

  it("should step the first item out to sit before its list", () => {
    expect(stepIn("intro\n\n- a\n- b", "listItem", 0, true)).toBe(
      "intro\n\na\n\n- b\n\n"
    );
  });

  it("should move a quoted paragraph within its blockquote", () => {
    expect(stepIn("> one\n>\n> two", "paragraph", 0, false)).toBe(
      "> two\n>\n> one\n\n"
    );
  });

  it("should keep a code block's language when it moves", () => {
    expect(
      stepIn("```ts\nconst a = 1;\n```\n\npara", "codeBlock", 0, false)
    ).toBe("para\n\n```ts\nconst a = 1;\n```\n\n");
  });
});

describe("moveRange over a selection", () => {
  it("should move three selected paragraphs as one", () => {
    const editor = load("one\n\ntwo\n\nthree\n\nfour");
    const { doc } = editor.state;

    editor.commands.setTextSelection({
      from: inside(doc, "paragraph", 0),
      to: inside(doc, "paragraph", 2) + 5,
    });

    const range = movingRange(editor.state.doc, editor.state.selection);

    if (range === null) {
      editor.destroy();
      throw new Error("expected a range");
    }

    const tr = moveRange(editor.state, range, editor.state.doc.content.size);

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(tr);
    editor.state.doc.check();

    const output = serializeMarkdown(editor);

    editor.destroy();

    expect(output).toBe("four\n\none\n\ntwo\n\nthree");
  });

  it("should move a heading and its body when both are selected", () => {
    const editor = load("# one\n\nbody one\n\n# two\n\nbody two");
    const { doc } = editor.state;

    editor.commands.setTextSelection({
      from: inside(doc, "heading", 0),
      to: inside(doc, "paragraph", 0) + 3,
    });

    const range = movingRange(editor.state.doc, editor.state.selection);

    if (range === null) {
      editor.destroy();
      throw new Error("expected a range");
    }

    const tr = moveRange(editor.state, range, editor.state.doc.content.size);

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(tr);
    editor.state.doc.check();

    const output = serializeMarkdown(editor);

    editor.destroy();

    expect(output).toBe("# two\n\nbody two\n\n# one\n\nbody one");
  });

  it("should turn a bullet into a task when it lands in a task list", () => {
    const editor = load("- bullet\n\nsplit\n\n- [ ] task");
    const { doc } = editor.state;
    const at = inside(doc, "listItem", 0);

    editor.commands.setTextSelection({ from: at, to: at });

    const range = movingRange(editor.state.doc, editor.state.selection);

    if (range === null) {
      editor.destroy();
      throw new Error("expected a range");
    }

    const tr = moveRange(
      editor.state,
      range,
      inside(editor.state.doc, "taskItem", 0) - 1
    );

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(tr);
    editor.state.doc.check();

    const output = serializeMarkdown(editor);

    editor.destroy();

    expect(output).toBe("split\n\n- [ ] bullet\n- [ ] task\n\n");
  });

  it("should drop the list when its last item steps out of it", () => {
    // The item leaves the list, which `deleteRange` takes with it, and lands
    // where the list was. The order only changes on the step after.
    expect(stepIn("- only\n\npara", "listItem", 0, false)).toBe("only\n\npara");
    expect(stepIn("only\n\npara", "paragraph", 0, false)).toBe("para\n\nonly");
  });

  it("should keep a task a task when it lands on another task", () => {
    // The screenshot case: the drop position is *inside* the other item's
    // text, which is where a pointer actually lands. Softening it to a
    // boundary would stop the test reproducing the bug it exists for.
    const editor = load("- [ ] one\n- [ ] two");
    const at = inside(editor.state.doc, "taskItem", 0);

    editor.commands.setTextSelection({ from: at, to: at });

    const range = movingRange(editor.state.doc, editor.state.selection);

    if (range === null) {
      editor.destroy();
      throw new Error("expected a range");
    }

    // The lower half of the second item, which is where the screenshot dropped.
    const second = editor.state.doc.resolve(
      inside(editor.state.doc, "taskItem", 1)
    ).parent;
    const tr = moveRange(
      editor.state,
      range,
      inside(editor.state.doc, "taskItem", 1) + second.content.size - 1
    );

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(tr);
    editor.state.doc.check();

    const output = serializeMarkdown(editor);

    editor.destroy();

    expect(output).toBe("- [ ] two\n- [ ] one\n\n");
  });

  it("should treat a drop on an item's top half as landing before it", () => {
    // Item one is already there, so the move is a no-op rather than a shuffle.
    const editor = load("- [ ] one\n- [ ] two");
    const at = inside(editor.state.doc, "taskItem", 0);

    editor.commands.setTextSelection({ from: at, to: at });

    const range = movingRange(editor.state.doc, editor.state.selection);

    if (range === null) {
      editor.destroy();
      throw new Error("expected a range");
    }

    const tr = moveRange(
      editor.state,
      range,
      inside(editor.state.doc, "taskItem", 1) + 1
    );

    editor.destroy();

    expect(tr).toBeNull();
  });

  it("should undo a move in one step", () => {
    const editor = load("one\n\ntwo\n\nthree");
    const at = inside(editor.state.doc, "paragraph", 1);

    editor.commands.setTextSelection({ from: at, to: at });

    const tr = moveRangeByStep(editor.state, true);

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(tr);

    expect(serializeMarkdown(editor)).toBe("two\n\none\n\nthree");

    editor.commands.undo();

    const output = serializeMarkdown(editor);

    editor.destroy();

    expect(output).toBe("one\n\ntwo\n\nthree");
  });

  it("should leave the selection over what moved", () => {
    const editor = load("one\n\ntwo");
    const at = inside(editor.state.doc, "paragraph", 0);

    editor.commands.setTextSelection({ from: at, to: at });

    const tr = moveRangeByStep(editor.state, false);

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(tr);

    const text = editor.state.selection.$from.parent.textContent;

    editor.destroy();

    expect(text).toBe("one");
  });

  it("should keep a caret a caret when a paragraph moves", () => {
    const editor = load("one\n\ntwo");
    const at = inside(editor.state.doc, "paragraph", 0);

    editor.commands.setTextSelection({ from: at, to: at });

    const tr = moveRangeByStep(editor.state, false);

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(tr);

    const { empty } = editor.state.selection;
    const text = editor.state.selection.$from.parent.textContent;

    editor.destroy();

    expect(empty).toBe(true);
    expect(text).toBe("one");
  });

  it("should leave a keyboard move free to recenter the typewriter", () => {
    const editor = load("one\n\ntwo");
    const at = inside(editor.state.doc, "paragraph", 0);

    editor.commands.setTextSelection({ from: at, to: at });

    const tr = moveRangeByStep(editor.state, false);
    const pointer = tr?.getMeta("pointer");

    editor.destroy();

    expect(pointer).toBeUndefined();
  });
});

describe("tables", () => {
  const TABLE = "| a | b |\n| - | - |\n| one | two |\n| three | four |";

  it("should move the row a caret sits in, not the cell's paragraph", () => {
    const editor = load(TABLE);
    // The caret is in "one", a cell's own paragraph.
    const at = inside(editor.state.doc, "tableCell", 0) + 1;

    editor.commands.setTextSelection({ from: at, to: at });

    const range = movingRange(editor.state.doc, editor.state.selection);
    const parent = range?.parent.type.name;

    editor.destroy();

    expect(parent).toBe("table");
  });

  it("should swap two body rows", () => {
    const editor = load(TABLE);
    const at = inside(editor.state.doc, "tableCell", 0) + 1;

    editor.commands.setTextSelection({ from: at, to: at });

    const tr = moveRangeByStep(editor.state, false);

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(tr);
    editor.state.doc.check();

    const output = serializeMarkdown(editor);

    editor.destroy();

    // The surrounding blank lines are the table serializer's own, present on a
    // plain load and after any edit at all, so they belong to the editor.
    expect(output).toBe(
      "\n| a     | b    |\n| ----- | ---- |\n| three | four |\n| one   | two  |\n\n\n"
    );
  });

  it("should leave a caret a caret rather than banding what moved", () => {
    // A range covering the whole row renders as a ragged highlight across its
    // cells, so what the caret had is what it keeps.
    const editor = load(TABLE);
    const at = inside(editor.state.doc, "tableCell", 0) + 1;

    editor.commands.setTextSelection({ from: at, to: at });

    const tr = moveRangeByStep(editor.state, false);

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(tr);

    const { empty, $from } = editor.state.selection;
    const cell = $from.node($from.depth - 1).type.name;

    editor.destroy();

    expect(empty).toBe(true);
    expect(cell).toBe("tableCell");
  });

  it("should leave a drag with a caret rather than a highlight", () => {
    // A drag's selection is only what it grabbed, so carrying it past the drop
    // left a stray box on one cell's text.
    const editor = load(TABLE);
    const p = inside(editor.state.doc, "tableCell", 0) + 1;

    editor.commands.setTextSelection({ from: p, to: p + 3 });

    const range = movingRange(editor.state.doc, editor.state.selection);

    if (range === null) {
      editor.destroy();
      throw new Error("expected a range");
    }

    const target = stepTargetFor(range);
    const tr = target === null ? null : moveRange(editor.state, range, target);

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(collapseMove(tr));

    const { $from, empty } = editor.state.selection;
    const cell = $from.node($from.depth - 1).type.name;

    editor.destroy();

    expect(empty).toBe(true);
    expect(cell).toBe("tableCell");
  });

  it("should end a row move with a caret even from a cross-cell selection", () => {
    // A selection spanning cells carried forward rebuilds as a text selection
    // across them, which paints ragged. A drag ends with a caret, and so does
    // this.
    const editor = load(TABLE);
    const first = inside(editor.state.doc, "tableCell", 0) + 1;
    const second = inside(editor.state.doc, "tableCell", 1) + 1;

    editor.commands.setTextSelection({ from: first, to: second });

    const tr = moveRangeByStep(editor.state, false);

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(tr);

    const { $from, empty } = editor.state.selection;
    const cell = $from.node($from.depth - 1).type.name;

    editor.destroy();

    expect(empty).toBe(true);
    expect(cell).toBe("tableCell");
  });

  it("should refuse to move a row out of the bottom of its table", () => {
    const editor = load(TABLE);
    const at = inside(editor.state.doc, "tableCell", 2) + 1;

    editor.commands.setTextSelection({ from: at, to: at });

    const tr = moveRangeByStep(editor.state, false);

    editor.destroy();

    expect(tr).toBeNull();
  });

  it("should refuse to move a body row above the header", () => {
    const editor = load(TABLE);
    const at = inside(editor.state.doc, "tableCell", 0) + 1;

    editor.commands.setTextSelection({ from: at, to: at });

    const tr = moveRangeByStep(editor.state, true);

    editor.destroy();

    expect(tr).toBeNull();
  });

  it("should refuse to move the header row at all", () => {
    const editor = load(TABLE);
    const at = inside(editor.state.doc, "tableHeader", 0) + 1;

    editor.commands.setTextSelection({ from: at, to: at });

    const range = movingRange(editor.state.doc, editor.state.selection);
    const down = moveRangeByStep(editor.state, false);

    editor.destroy();

    expect(range).toBeNull();
    expect(down).toBeNull();
  });

  it("should refuse to drop a row outside its own table", () => {
    const editor = load(`${TABLE}\n\nafter`);
    const at = inside(editor.state.doc, "tableCell", 0) + 1;

    editor.commands.setTextSelection({ from: at, to: at });

    const range = movingRange(editor.state.doc, editor.state.selection);

    if (range === null) {
      editor.destroy();
      throw new Error("expected a range");
    }

    const outside = dropTarget(
      editor.state.doc,
      range,
      editor.state.doc.content.size - 1
    );
    const moved = moveRange(
      editor.state,
      range,
      editor.state.doc.content.size - 1
    );

    editor.destroy();

    expect(outside).toBeNull();
    expect(moved).toBeNull();
  });

  it("should step a paragraph around a table rather than into it", () => {
    const editor = load(`before\n\n${TABLE}\n\nafter`);
    const at = inside(editor.state.doc, "paragraph", 0);

    editor.commands.setTextSelection({ from: at, to: at });

    const tr = moveRangeByStep(editor.state, false);

    if (tr === null) {
      editor.destroy();
      throw new Error("expected a transaction");
    }

    editor.view.dispatch(tr);
    editor.state.doc.check();

    const output = serializeMarkdown(editor);

    editor.destroy();

    // The table is intact and the paragraph is on its far side.
    expect(output).toContain("| one   | two  |");
    expect(output.indexOf("before")).toBeGreaterThan(output.indexOf("| one"));
  });
});
