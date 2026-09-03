import type { EditorView } from "@tiptap/pm/view";

/** The class the body wears while a drag runs, so the cursor follows it. */
const DRAGGING_CLASS = "dragging-blocks";

/** A row renders as nothing outside a table, so it travels with one. */
function wrapRow(row: HTMLElement, source: HTMLElement) {
  const table = document.createElement("table");
  const body = document.createElement("tbody");
  const origin = source.closest("table");

  if (origin !== null) {
    table.className = origin.className;
    table.style.width = `${origin.getBoundingClientRect().width}px`;
  }

  body.append(row);
  table.append(body);

  return table;
}

/**
 * A copy of the blocks being dragged, following the pointer under the same
 * shadow a dragged tab takes (`D60`).
 *
 * It lives on `document.body` rather than in the editor for two reasons, both
 * of which broke earlier versions of this feature: ProseMirror's observer
 * reverts DOM it manages, and anything under the cursor would intercept the
 * `posAtCoords` hit test the drop target is resolved from, so it also takes
 * `pointer-events: none`.
 */
export class DragGhost {
  private readonly element: HTMLDivElement;
  private readonly offsetX: number;
  private readonly offsetY: number;

  constructor(
    view: EditorView,
    blocks: number[],
    clientX: number,
    clientY: number
  ) {
    const element = document.createElement("div");

    // The note's own typography, since the ghost sits on the body and would
    // otherwise fall back to the chrome's sans (`D40`).
    element.className = "typeset typeset-note block-drag-ghost";
    element.setAttribute("aria-hidden", "true");

    let anchor: DOMRect | null = null;

    for (const pos of blocks) {
      const dom = view.nodeDOM(pos);

      if (!(dom instanceof HTMLElement)) {
        continue;
      }

      anchor ??= dom.getBoundingClientRect();

      const clone = dom.cloneNode(true) as HTMLElement;

      element.append(clone.tagName === "TR" ? wrapRow(clone, dom) : clone);
    }

    // The block's own width, so the text wraps the way it did in the note.
    if (anchor !== null) {
      element.style.width = `${anchor.width}px`;
    }

    // Anchored where it was grabbed, so it does not jump under the cursor.
    this.offsetX = clientX - (anchor?.left ?? clientX);
    this.offsetY = clientY - (anchor?.top ?? clientY);
    this.element = element;

    document.body.append(element);
    document.body.classList.add(DRAGGING_CLASS);
    this.moveTo(clientX, clientY);
  }

  moveTo(clientX: number, clientY: number) {
    this.element.style.transform = `translate3d(${clientX - this.offsetX}px, ${clientY - this.offsetY}px, 0)`;
  }

  destroy() {
    this.element.remove();
    document.body.classList.remove(DRAGGING_CLASS);
  }
}
