import { Extension } from "@tiptap/core";
import type { Node, NodeRange } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { DragGhost } from "./drag-ghost";
import {
  blockSelection,
  collapseMove,
  dropTarget,
  moveRange,
  movingRange,
} from "./move-selection";

/** The tab strip's number, so both drags start at the same distance. */
const ACTIVATION_DISTANCE_PX = 4;
const REPEAT_MS = 500;
const REPEAT_DISTANCE_PX = 10;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 8;

const dragSelectionKey = new PluginKey<DragState>("dragSelection");

interface Span {
  end: number;
  start: number;
}

interface Press {
  time: number;
  x: number;
  y: number;
}

/** ProseMirror's own window for one click following another. */
function isRepeat(previous: null | Press, event: PointerEvent) {
  if (previous === null) {
    return false;
  }

  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;

  return (
    event.timeStamp - previous.time < REPEAT_MS &&
    dx * dx + dy * dy < REPEAT_DISTANCE_PX * REPEAT_DISTANCE_PX
  );
}

interface DragState {
  /** The blocks in flight, dimmed where they sit. */
  dragAt: null | Span;
  /** Where the line is drawn, which is where the drop will land. */
  dropAt: null | number;
}

const NOTHING: DragState = { dragAt: null, dropAt: null };

function dropLine() {
  const line = document.createElement("div");

  line.className = "block-drop-indicator";

  return line;
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
function dimmed(doc: Node, span: Span) {
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
 * you dropped on is a question about its box, so it is answered here rather
 * than in `move-selection.ts`: a document position tracks how far along the
 * text you are, which is horizontal, and would read a drop at the bottom-left
 * of a block as landing above it. `itemBoundary` there still answers it from
 * the position alone, as the fallback for whatever arrives unresolved.
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

class DragSelectionView {
  private readonly view: EditorView;
  private drag: null | {
    moved: boolean;
    originX: number;
    originY: number;
    pointerId: number;
    pressedAt: number;
    range: NodeRange;
    repeated: boolean;
    span: Span;
  } = null;
  private ghost: DragGhost | null = null;
  private lastPress: null | Press = null;
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

    if (merged.dragAt === current.dragAt && merged.dropAt === current.dropAt) {
      return;
    }

    view.dispatch(view.state.tr.setMeta(dragSelectionKey, merged));
  }

  private stop() {
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

    const pos = boundaryUnder(view, clientX, clientY);

    if (pos === null) {
      return;
    }

    this.patch({ dropAt: dropTarget(view.state.doc, drag.range, pos) });
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    const { view } = this;

    if (event.button !== 0) {
      return;
    }

    const pos = posUnder(view, event.clientX, event.clientY);
    const repeated = isRepeat(this.lastPress, event);

    // Every left press, not only the ones that go on to drag: the third click
    // of a triple is the first to land inside a selection, so the pair before
    // it has to have been counted.
    this.lastPress = {
      time: event.timeStamp,
      x: event.clientX,
      y: event.clientY,
    };

    if (event.shiftKey || pos === null || !isInsideSelection(view.state, pos)) {
      return;
    }

    const range = movingRange(view.state.doc, view.state.selection);

    if (range === null) {
      return;
    }

    // Stops the browser collapsing the selection before we know whether this is
    // a drag, which means a press that never moves has to place the caret. It
    // cannot wait for `mousedown` and read the click count there: the press
    // that starts a drag is the second of a pair, since it follows the click
    // that made the selection, so a repeated click and a drag are the same
    // event until the pointer moves.
    event.preventDefault();
    // Capture keeps the drag alive past the editor's own box. A pointer the
    // browser no longer tracks refuses it, and the drag is still workable.
    try {
      view.dom.setPointerCapture(event.pointerId);
    } catch {
      // no capture, so the pointer has to stay over the editor
    }
    // Only for the length of the drag. A session may not hold a window listener
    // (`D53`), and one pointer means one drag, so this never multiplies the way
    // a listener registered per editor would.
    window.addEventListener("keydown", this.onKeyDown);
    this.pointerY = event.clientY;
    this.drag = {
      moved: false,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
      pressedAt: pos,
      range,
      repeated,
      span: { end: range.end, start: range.start },
    };
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const { drag, view } = this;

    if (drag === null) {
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
      this.ghost = new DragGhost(
        view,
        blocksIn(view.state.doc, drag.span),
        event.clientX,
        event.clientY
      );
      this.patch({ dragAt: drag.span });
      this.autoScroll();
    }

    this.ghost?.moveTo(event.clientX, event.clientY);
    this.track(event.clientX, event.clientY);
  };

  private readonly onPointerUp = () => {
    const { drag, view } = this;

    if (drag === null) {
      return;
    }

    if (view.dom.hasPointerCapture(drag.pointerId)) {
      view.dom.releasePointerCapture(drag.pointerId);
    }

    const { dropAt } = dragSelectionKey.getState(view.state) ?? NOTHING;
    // The range the press captured, not one recomputed from the live selection:
    // the two can disagree, and then the blocks that dim are not the blocks
    // that move.
    const { moved, pressedAt, range, repeated } = drag;

    this.stop();

    if (!moved) {
      // The press was a click after all, and `preventDefault` means the browser
      // did not move the caret, so place it where the pointer went down. A
      // repeated click takes the block instead, which is the browser's own
      // answer and is only knowable here: a third click and the press that
      // starts a drag are the same event until the pointer moves.
      const block = repeated ? blockSelection(view.state.doc, pressedAt) : null;

      view.dispatch(
        view.state.tr
          .setSelection(
            block ?? TextSelection.near(view.state.doc.resolve(pressedAt))
          )
          .setMeta("pointer", true)
      );

      return;
    }

    if (dropAt === null) {
      return;
    }

    // The drop collapses the selection, since it was only what the drag took
    // hold of. `pointer` meta keeps the typewriter on its default scroll, so
    // the note does not lurch under a drop (`D63`).
    const shifted = moveRange(view.state, range, dropAt);
    const tr =
      shifted === null ? null : collapseMove(shifted).setMeta("pointer", true);

    if (tr !== null) {
      view.dispatch(tr);
    }
  };

  private readonly onCancel = () => {
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
 * Dragging the selection moves it. The blocks in flight dim where they sit and
 * a line marks where they land, both as decorations so neither can be drawn
 * somewhere the transaction disagrees with. Nothing is added to the reading
 * surface at rest: the gesture is the one text already uses, and
 * `move-selection.ts` decides what a selection covers (`D71`).
 */
export const DragSelection = Extension.create({
  addProseMirrorPlugins() {
    return [
      new Plugin<DragState>({
        key: dragSelectionKey,
        props: {
          decorations(state) {
            const { dragAt, dropAt } = this.getState(state) ?? NOTHING;

            if (dragAt === null && dropAt === null) {
              return null;
            }

            const decorations =
              dragAt === null ? [] : dimmed(state.doc, dragAt);

            if (dropAt !== null) {
              decorations.push(
                Decoration.widget(dropAt, dropLine, { key: "block-drop" })
              );
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
