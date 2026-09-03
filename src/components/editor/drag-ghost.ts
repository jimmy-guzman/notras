import type { EditorView } from "@tiptap/pm/view";

/** The class the body wears while a drag runs, so the cursor follows it. */
const DRAGGING_CLASS = "dragging-blocks";

/** The ancestors that style their children, so a clone cannot leave them behind. */
const STRUCTURAL = new Set(["OL", "TABLE", "TBODY", "THEAD", "UL"]);

/**
 * The clones with those ancestors rebuilt around them. A row renders as nothing
 * outside a table, and a list item outside its list loses the row recipe and
 * grows a marker, since both are reached through the parent. One wrapper holds
 * the lot, because a drag takes siblings and two of them in two lists would
 * carry a list's margins between rows that had none. The attributes come along
 * because `data-type` is what tells a task list from a bullet one.
 */
function structured(clones: HTMLElement[], source: HTMLElement) {
  let nodes: Node[] = clones;
  let child = source;
  let origin = source.parentElement;

  while (origin !== null && STRUCTURAL.has(origin.tagName)) {
    const wrapper = document.createElement(origin.tagName);

    for (const { name, value } of Array.from(origin.attributes)) {
      wrapper.setAttribute(name, value);
    }

    // A table sizes its columns to their content, so a row torn out of one
    // comes back narrower than the row it left.
    if (wrapper instanceof HTMLTableElement) {
      wrapper.style.width = `${origin.getBoundingClientRect().width}px`;
    }

    // A fresh list counts from one, which would renumber the item under the
    // cursor. Set after the attributes, which carry the origin's own start.
    if (
      wrapper instanceof HTMLOListElement &&
      origin instanceof HTMLOListElement
    ) {
      wrapper.start = origin.start + Array.from(origin.children).indexOf(child);
    }

    wrapper.append(...nodes);
    nodes = [wrapper];
    child = origin;
    origin = origin.parentElement;
  }

  return nodes;
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

    // Every rule for note content is scoped to `.ProseMirror`, so a clone
    // outside the editor is a list with no row recipe until one is over it. It
    // is an inner element rather than the ghost's own class because the editor
    // root carries `min-height: 100%`, which a fixed ghost would resolve
    // against the viewport and grow a screen tall.
    const surface = document.createElement("div");

    surface.className = "ProseMirror";
    element.setAttribute("aria-hidden", "true");

    const clones: HTMLElement[] = [];
    let anchor: DOMRect | null = null;
    let source: null | HTMLElement = null;

    for (const pos of blocks) {
      const dom = view.nodeDOM(pos);

      if (!(dom instanceof HTMLElement)) {
        continue;
      }

      anchor ??= dom.getBoundingClientRect();
      source ??= dom;
      clones.push(dom.cloneNode(true) as HTMLElement);
    }

    if (source !== null) {
      surface.append(...structured(clones, source));
      element.append(surface);
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
