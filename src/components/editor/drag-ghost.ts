import type { EditorView } from "@tiptap/pm/view";

/** The class the body wears while a drag runs, so the cursor follows it. */
const DRAGGING_CLASS = "dragging";

/**
 * How far below and right of the pointer the copy sits. Anchored where it was
 * grabbed it covered the pointer, and with it the bar marking the drop. This
 * clears the cursor glyph too.
 */
const POINTER_GAP_PX = 16;

/** The ancestors that style their children, so a clone cannot leave them behind. */
const STRUCTURAL = new Set(["OL", "TABLE", "TBODY", "THEAD", "UL"]);

/** An empty copy of `element`, attributes and all. */
function shellOf(element: HTMLElement) {
  const shell = document.createElement(element.tagName);

  for (const { name, value } of Array.from(element.attributes)) {
    shell.setAttribute(name, value);
  }

  return shell;
}

/**
 * The clones with those ancestors rebuilt around them. A row renders as nothing
 * outside a table, and an item loses its row recipe outside its list, since
 * both are reached through the parent. One wrapper holds the set, or two items
 * would carry a list's margins between rows that had none.
 */
function structured(clones: Node[], source: HTMLElement) {
  let nodes: Node[] = clones;
  let child = source;
  let origin = source.parentElement;

  while (origin !== null && STRUCTURAL.has(origin.tagName)) {
    const wrapper = shellOf(origin);

    // A table sizes its columns to their content, so a row torn out of one
    // comes back narrower than the row it left.
    if (wrapper instanceof HTMLTableElement) {
      wrapper.style.width = `${origin.getBoundingClientRect().width}px`;
    }

    // A fresh list counts from one, renumbering the item under the cursor.
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
 * The words with the elements around them rebuilt, up to the block's own.
 * `cloneContents` keeps the partly covered elements below the range's common
 * ancestor and drops that ancestor itself, so words wholly inside one mark
 * would arrive bare, and words in a code block without their `pre`.
 */
function wrapped(range: Range, block: HTMLElement) {
  let node: Node = range.cloneContents();
  let ancestor: Node | null = range.commonAncestorContainer;

  while (ancestor !== null && ancestor !== block) {
    if (ancestor instanceof HTMLElement) {
      const shell = shellOf(ancestor);

      shell.append(node);
      node = shell;
    }

    ancestor = ancestor.parentNode;
  }

  const shell = shellOf(block);

  shell.append(node);

  return shell;
}

/**
 * A copy of what is being dragged, following the pointer under the same shadow
 * a dragged tab takes, and sitting below and right of it so the bar marking
 * the drop stays in view. It lives on `document.body` rather than in the editor
 * for two reasons, both of which broke earlier versions: ProseMirror's observer
 * reverts DOM it manages, and anything under the cursor would intercept the
 * `posAtCoords` hit test the drop is resolved from, hence `pointer-events:
 * none`.
 */
export class DragGhost {
  private readonly element: HTMLDivElement;

  private constructor(
    nodes: Node[],
    width: null | number,
    clientX: number,
    clientY: number
  ) {
    const element = document.createElement("div");

    // The note's own typography, since the ghost sits on the body and would
    // otherwise fall back to the chrome's sans.
    element.className = "typeset typeset-note drag-ghost";

    // Every rule for note content is scoped to `.ProseMirror`. An inner element
    // rather than the ghost's own class, because the editor root carries
    // `min-height: 100%`, which a fixed ghost resolves against the viewport.
    const surface = document.createElement("div");

    surface.className = "ProseMirror";
    element.setAttribute("aria-hidden", "true");

    if (nodes.length > 0) {
      surface.append(...nodes);
      element.append(surface);
    }

    // The copy hugs what it holds and wraps at the block's width at most,
    // which is where the note wrapped it too.
    if (width !== null) {
      element.style.maxWidth = `${width}px`;
    }

    this.element = element;

    document.body.append(element);
    document.body.classList.add(DRAGGING_CLASS);
    this.moveTo(clientX, clientY);
  }

  /** The blocks starting at `starts`, with the ancestors that style them. */
  static ofBlocks(
    view: EditorView,
    starts: number[],
    clientX: number,
    clientY: number
  ) {
    const clones: Node[] = [];
    let width: null | number = null;
    let source: null | HTMLElement = null;

    for (const pos of starts) {
      const dom = view.nodeDOM(pos);

      if (!(dom instanceof HTMLElement)) {
        continue;
      }

      width ??= dom.getBoundingClientRect().width;
      source ??= dom;
      clones.push(dom.cloneNode(true));
    }

    const nodes = source === null ? [] : structured(clones, source);

    return new DragGhost(nodes, width, clientX, clientY);
  }

  /**
   * The words between `from` and `to` in their block's own element, so words
   * from a heading keep its type.
   */
  static ofText(
    view: EditorView,
    from: number,
    to: number,
    clientX: number,
    clientY: number
  ) {
    const $from = view.state.doc.resolve(from);
    const block = view.nodeDOM($from.before($from.depth));
    const start = view.domAtPos(from);
    const end = view.domAtPos(to);
    const range = document.createRange();

    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    if (!(block instanceof HTMLElement)) {
      return new DragGhost([], null, clientX, clientY);
    }

    return new DragGhost(
      [wrapped(range, block)],
      block.getBoundingClientRect().width,
      clientX,
      clientY
    );
  }

  moveTo(clientX: number, clientY: number) {
    this.element.style.transform = `translate3d(${clientX + POINTER_GAP_PX}px, ${clientY + POINTER_GAP_PX}px, 0)`;
  }

  destroy() {
    this.element.remove();
    document.body.classList.remove(DRAGGING_CLASS);
  }
}
