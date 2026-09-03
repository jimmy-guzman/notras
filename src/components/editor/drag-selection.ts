import { Extension } from "@tiptap/core";
import type { Node, NodeRange } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { DragGhost } from "./drag-ghost";
import {
  collapseMove,
  dragRange,
  dropTarget,
  moveRange,
  moveText,
  textDropTarget,
} from "./move-selection";

/** The tab strip's number, so both drags start at the same distance. */
const ACTIVATION_DISTANCE_PX = 4;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 8;

const dragSelectionKey = new PluginKey<DragState>("dragSelection");

interface Span {
  end: number;
  start: number;
}

/** What a drag holds: whole blocks, or the words inside one. */
type Held =
  | { kind: "blocks"; range: NodeRange; span: Span }
  | { kind: "text"; span: Span };

interface DragState {
  /** Where the drop will land, which the mark is drawn for. */
  dropAt: null | number;
  /** What is in flight, dimmed where it sits. */
  held: null | { kind: Held["kind"]; span: Span };
}

const NOTHING: DragState = { dropAt: null, held: null };

function dropCursor() {
  const mark = document.createElement("span");

  mark.className = "drop-cursor";

  return mark;
}

function dropCursorTail() {
  const mark = document.createElement("div");

  mark.className = "drop-cursor-tail";

  return mark;
}

/**
 * Where the mark for a drop at `pos` is drawn. Words land at a text position,
 * which is its own mark. Blocks land before a block, and the mark stands at
 * the start of its first line, which is the first text position inside it.
 * Null where nothing there holds text, so the tail form stands at `pos`.
 */
function markPosition(doc: Node, pos: number) {
  const $pos = doc.resolve(pos);

  if ($pos.parent.inlineContent) {
    return pos;
  }

  let node = $pos.nodeAfter;
  let at = pos + 1;

  while (node !== null && !node.inlineContent) {
    node = node.firstChild;
    at += 1;
  }

  return node === null ? null : at;
}

function dropMark(doc: Node, dropAt: number) {
  const at = markPosition(doc, dropAt);

  // Two keys, since ProseMirror reuses a widget's DOM by key and the form has
  // to change with the position.
  return at === null
    ? Decoration.widget(dropAt, dropCursorTail, { key: "drop-cursor-tail" })
    : Decoration.widget(at, dropCursor, { key: "drop-cursor" });
}

/** The scroller the note sits in, which a drag near the edge has to move. */
function scrollerOf(dom: HTMLElement) {
  let node = dom.parentElement;

  while (node !== null) {
    if (node.scrollHeight > node.clientHeight) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
}

/** The start position of every block in a span, which the ghost clones. */
function blocksIn(doc: Node, span: Span) {
  const $start = doc.resolve(span.start);
  const { parent } = $start;
  const starts: number[] = [];
  let pos = span.start;
  let index = $start.index();

  while (pos < span.end && index < parent.childCount) {
    starts.push(pos);
    pos += parent.child(index).nodeSize;
    index += 1;
  }

  return starts;
}

/** One decoration per block in flight, since `Decoration.node` takes one node. */
function dimmedBlocks(doc: Node, span: Span) {
  const $start = doc.resolve(span.start);
  const { parent } = $start;
  const decorations: Decoration[] = [];
  let pos = span.start;
  let index = $start.index();

  while (pos < span.end && index < parent.childCount) {
    const size = parent.child(index).nodeSize;

    decorations.push(Decoration.node(pos, pos + size, { "data-dragging": "" }));
    pos += size;
    index += 1;
  }

  return decorations;
}

function dimmed(doc: Node, held: DragState["held"]) {
  if (held === null) {
    return [];
  }

  if (held.kind === "blocks") {
    return dimmedBlocks(doc, held.span);
  }

  return [
    Decoration.inline(held.span.start, held.span.end, { "data-dragging": "" }),
  ];
}

/** Containers whose children are rows a drop can land beside. */
const ROW_CONTAINERS = new Set([
  "blockquote",
  "bulletList",
  "orderedList",
  "table",
  "taskList",
]);

/** The document position under the pointer, or null off the editor. */
function posUnder(view: EditorView, clientX: number, clientY: number) {
  return view.posAtCoords({ left: clientX, top: clientY })?.pos ?? null;
}

/**
 * The gap the pointer is nearest, as a document position. Which side of a block
 * a drop landed on is a question about its box: a document position tracks how
 * far along the text the pointer is, and would read a drop at the bottom left
 * of a block as landing above it.
 */
function boundaryUnder(view: EditorView, clientX: number, clientY: number) {
  const pos = posUnder(view, clientX, clientY);

  if (pos === null) {
    return null;
  }

  const $pos = view.state.doc.resolve(pos);
  const { depth: from } = $pos;

  for (let depth = from; depth >= 1; depth -= 1) {
    const container = $pos.node(depth - 1).type.name;

    if (container !== "doc" && !ROW_CONTAINERS.has(container)) {
      continue;
    }

    const dom = view.nodeDOM($pos.before(depth));

    if (!(dom instanceof HTMLElement)) {
      break;
    }

    const rect = dom.getBoundingClientRect();

    if (rect.height === 0) {
      break;
    }

    return clientY < rect.top + rect.height / 2
      ? $pos.before(depth)
      : $pos.after(depth);
  }

  return pos;
}

function isInsideSelection(state: EditorState, pos: number) {
  const { empty, from, to } = state.selection;

  return !empty && pos >= from && pos <= to;
}

/** What the press took hold of, read off the selection it landed in. */
function heldBy(state: EditorState): Held {
  const range = dragRange(state.doc, state.selection);

  // Null is a selection about words, which moves as text.
  if (range === null) {
    const { from, to } = state.selection;

    return { kind: "text", span: { end: to, start: from } };
  }

  return {
    kind: "blocks",
    range,
    span: { end: range.end, start: range.start },
  };
}

function ghostFor(
  view: EditorView,
  held: Held,
  clientX: number,
  clientY: number
) {
  if (held.kind === "blocks") {
    return DragGhost.ofBlocks(
      view,
      blocksIn(view.state.doc, held.span),
      clientX,
      clientY
    );
  }

  return DragGhost.ofText(
    view,
    held.span.start,
    held.span.end,
    clientX,
    clientY
  );
}

/**
 * The transaction a drop at `at` makes, or null when nothing would move. A
 * block drop collapses to a caret, and a text drop keeps the words it landed
 * selected, since that highlight covers exactly what moved.
 */
function dropped(state: EditorState, held: Held, at: number) {
  if (held.kind === "text") {
    return moveText(state, held.span.start, held.span.end, at);
  }

  const shifted = moveRange(state, held.range, at);

  return shifted === null ? null : collapseMove(shifted);
}

class DragSelectionView {
  private readonly view: EditorView;
  private drag: null | {
    held: Held;
    moved: boolean;
    originX: number;
    originY: number;
    pointerId: number;
    pressedAt: number;
  } = null;
  private ghost: DragGhost | null = null;
  private pointerY = 0;
  private scrollFrame = 0;

  constructor(view: EditorView) {
    this.view = view;
    // The press starts inside the selection, which is inside the editor, so
    // there is no surface outside `view.dom` to listen on.
    view.dom.addEventListener("pointerdown", this.onPointerDown);
    view.dom.addEventListener("pointermove", this.onPointerMove);
    view.dom.addEventListener("pointerup", this.onPointerUp);
    view.dom.addEventListener("pointercancel", this.onCancel);
  }

  destroy() {
    const { view } = this;

    view.dom.removeEventListener("pointerdown", this.onPointerDown);
    view.dom.removeEventListener("pointermove", this.onPointerMove);
    view.dom.removeEventListener("pointerup", this.onPointerUp);
    view.dom.removeEventListener("pointercancel", this.onCancel);
    this.stop();
  }

  /**
   * Both marks are decorations: ProseMirror's observer reverts an attribute set
   * by hand on a node it manages, and a meta transaction leaves the doc alone
   * so nothing here reaches `onUpdate` or the autosave.
   */
  private patch(next: Partial<DragState>) {
    const { view } = this;
    const current = dragSelectionKey.getState(view.state) ?? NOTHING;
    const merged = { ...current, ...next };

    if (merged.held === current.held && merged.dropAt === current.dropAt) {
      return;
    }

    view.dispatch(view.state.tr.setMeta(dragSelectionKey, merged));
  }

  private stop() {
    const { drag, view } = this;

    // Escape and a replacement press arrive with the pointer still down, and a
    // capture nobody released keeps retargeting its events at the editor.
    // `pointerup` and `pointercancel` released it already, hence the guard.
    if (drag !== null && view.dom.hasPointerCapture(drag.pointerId)) {
      view.dom.releasePointerCapture(drag.pointerId);
    }

    window.removeEventListener("keydown", this.onKeyDown);
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = 0;
    this.ghost?.destroy();
    this.ghost = null;
    this.drag = null;
    this.patch(NOTHING);
  }

  private track(clientX: number, clientY: number) {
    const { drag, view } = this;

    if (drag === null) {
      return;
    }

    const { held } = drag;

    if (held.kind === "blocks") {
      const pos = boundaryUnder(view, clientX, clientY);

      if (pos !== null) {
        this.patch({ dropAt: dropTarget(view.state.doc, held.range, pos) });
      }

      return;
    }

    const pos = posUnder(view, clientX, clientY);

    if (pos !== null) {
      this.patch({
        dropAt: textDropTarget(
          view.state.doc,
          held.span.start,
          held.span.end,
          pos
        ),
      });
    }
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    const { view } = this;

    // One drag, one pointer.
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }

    // A live drag and a fresh primary press cannot both be real: the pointer
    // that started it ended somewhere this never saw, which failing to capture
    // allows. Ending it here keeps a ghost from outliving its drag.
    if (this.drag !== null) {
      this.stop();
    }

    const pos = posUnder(view, event.clientX, event.clientY);

    if (event.shiftKey || pos === null || !isInsideSelection(view.state, pos)) {
      return;
    }

    // Stops the browser collapsing the selection before we know whether this is
    // a drag, which means a press that never moves has to place the caret.
    event.preventDefault();
    // Capture keeps the drag alive past the editor's own box. A pointer the
    // browser no longer tracks refuses it, and the drag is still workable.
    try {
      view.dom.setPointerCapture(event.pointerId);
    } catch {
      // no capture, so the pointer has to stay over the editor
    }
    // Only for the length of the drag, since one pointer means one drag and a
    // session may not hold a window listener.
    window.addEventListener("keydown", this.onKeyDown);
    this.pointerY = event.clientY;
    this.drag = {
      held: heldBy(view.state),
      moved: false,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
      pressedAt: pos,
    };
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const { drag, view } = this;

    if (drag === null || event.pointerId !== drag.pointerId) {
      return;
    }

    this.pointerY = event.clientY;

    if (!drag.moved) {
      const far =
        Math.abs(event.clientX - drag.originX) >= ACTIVATION_DISTANCE_PX ||
        Math.abs(event.clientY - drag.originY) >= ACTIVATION_DISTANCE_PX;

      if (!far) {
        return;
      }

      drag.moved = true;
      this.ghost = ghostFor(view, drag.held, event.clientX, event.clientY);
      this.patch({ held: { kind: drag.held.kind, span: drag.held.span } });
      this.autoScroll();
    }

    this.ghost?.moveTo(event.clientX, event.clientY);
    this.track(event.clientX, event.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const { drag, view } = this;

    if (drag === null || event.pointerId !== drag.pointerId) {
      return;
    }

    const { dropAt } = dragSelectionKey.getState(view.state) ?? NOTHING;
    // What the press captured, not one recomputed from the live selection: the
    // two can disagree, and then what dims is not what moves.
    const { held, moved, pressedAt } = drag;

    this.stop();

    if (!moved) {
      // The press was a click after all, and `preventDefault` means the browser
      // did not move the caret, so place it where the pointer went down.
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.near(view.state.doc.resolve(pressedAt)))
          .setMeta("pointer", true)
      );

      return;
    }

    if (dropAt === null) {
      return;
    }

    // `pointer` meta keeps the typewriter on its default scroll, so the note
    // does not lurch under a drop.
    const tr = dropped(view.state, held, dropAt);

    if (tr !== null) {
      view.dispatch(tr.setMeta("pointer", true));
    }
  };

  private readonly onCancel = (event: PointerEvent) => {
    if (this.drag?.pointerId !== event.pointerId) {
      return;
    }

    this.stop();
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.drag !== null) {
      this.stop();
    }
  };

  // Holding at an edge produces no pointermove, so the scroll needs its own
  // loop or a block cannot travel further than one viewport.
  private autoScroll() {
    const scroller = scrollerOf(this.view.dom);

    if (scroller === null) {
      return;
    }

    const step = () => {
      if (this.drag === null) {
        return;
      }

      const box = scroller.getBoundingClientRect();
      const middle = box.left + box.width / 2;

      if (this.pointerY < box.top + AUTOSCROLL_EDGE_PX) {
        scroller.scrollTop -= AUTOSCROLL_STEP_PX;
        this.track(middle, this.pointerY);
      } else if (this.pointerY > box.bottom - AUTOSCROLL_EDGE_PX) {
        scroller.scrollTop += AUTOSCROLL_STEP_PX;
        this.track(middle, this.pointerY);
      }

      this.scrollFrame = requestAnimationFrame(step);
    };

    this.scrollFrame = requestAnimationFrame(step);
  }
}

/**
 * Dragging the selection moves it: whole blocks when the selection is about
 * blocks, and the words alone when it sits inside one. What is in flight dims
 * where it sits and a bar marks where it lands, both as decorations so neither
 * can be drawn somewhere the transaction disagrees with. `move-selection.ts`
 * decides what a selection covers and where a drop lands.
 */
export const DragSelection = Extension.create({
  addProseMirrorPlugins() {
    return [
      new Plugin<DragState>({
        key: dragSelectionKey,
        props: {
          decorations(state) {
            const { dropAt, held } = this.getState(state) ?? NOTHING;

            if (held === null && dropAt === null) {
              return null;
            }

            const decorations = dimmed(state.doc, held);

            if (dropAt !== null) {
              decorations.push(dropMark(state.doc, dropAt));
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
        state: {
          apply: (tr, value) =>
            (tr.getMeta(dragSelectionKey) as DragState | undefined) ?? value,
          init: () => NOTHING,
        },
        view: (view) => new DragSelectionView(view),
      }),
    ];
  },

  name: "dragSelection",
});
