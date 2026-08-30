import { Extension } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

const GLIDE_MS = 150;

interface Glide {
  frame: number;
  lastWrite: number;
}

const glides = new WeakMap<HTMLElement, Glide>();

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function stopGlide(scroller: HTMLElement) {
  const glide = glides.get(scroller);

  if (glide !== undefined) {
    cancelAnimationFrame(glide.frame);
    glides.delete(scroller);
  }
}

function glideTo(scroller: HTMLElement, target: number) {
  stopGlide(scroller);

  if (prefersReducedMotion()) {
    scroller.scrollTop = target;

    return;
  }

  const from = scroller.scrollTop;
  const started = performance.now();
  const glide: Glide = { frame: 0, lastWrite: from };

  const step = (now: number) => {
    // A scrollTop this animator did not write means the person scrolled
    // (wheel, scrollbar, or the toggle compensation); the glide yields.
    if (Math.abs(scroller.scrollTop - glide.lastWrite) > 1) {
      glides.delete(scroller);

      return;
    }

    const t = Math.min((now - started) / GLIDE_MS, 1);

    scroller.scrollTop = from + (target - from) * easeOutCubic(t);
    // Read back rather than store the computed value: the browser clamps.
    glide.lastWrite = scroller.scrollTop;

    if (t < 1) {
      glide.frame = requestAnimationFrame(step);
    } else {
      glides.delete(scroller);
    }
  };

  glide.frame = requestAnimationFrame(step);
  glides.set(scroller, glide);
}

function centeredScrollTop(view: EditorView, scroller: HTMLElement) {
  const coords = view.coordsAtPos(view.state.selection.head);
  const rect = scroller.getBoundingClientRect();

  // The caret rect's vertical middle, not its top: anchoring the top edge
  // drifts with the active block's line-height.
  return (
    scroller.scrollTop +
    (coords.top + coords.bottom) / 2 -
    (rect.top + rect.height / 2)
  );
}

// ProseMirror's own margin for nearest-edge scrolling.
const X_MARGIN = 5;

// Replacing ProseMirror's scroll (`D63`) also silenced its ancestor walk,
// which kept the caret horizontally visible inside a code block's own
// scroller (typeset gives `pre` overflow-x). Restore that half: instant and
// nearest-edge, the way ProseMirror treats inner containers.
function keepCaretInInnerScroller(view: EditorView, scroller: HTMLElement) {
  const { node } = view.domAtPos(view.state.selection.head);
  const coords = view.coordsAtPos(view.state.selection.head);
  let el = node instanceof HTMLElement ? node : node.parentElement;

  while (el !== null && el !== scroller) {
    if (el.scrollWidth > el.clientWidth) {
      const rect = el.getBoundingClientRect();

      if (coords.left < rect.left + X_MARGIN) {
        el.scrollLeft -= rect.left + X_MARGIN - coords.left;
      } else if (coords.right > rect.right - X_MARGIN) {
        el.scrollLeft += coords.right - (rect.right - X_MARGIN);
      }

      return;
    }

    el = el.parentElement;
  }
}

/**
 * Transaction meta controlling the typewriter recenter: "skip" forces the
 * default scroll (the mount-time caret restore), "center" requests one (the
 * toggle), and everything else falls through to `scrollDecision`.
 */
export const TYPEWRITER_SCROLL = "typewriterScroll";

/**
 * Whether a transaction that asked to scroll the selection into view should
 * recenter the caret line ("center") or keep ProseMirror's default
 * nearest-edge scroll ("default"). Typing, deletion, undo, paste, and
 * keyboard caret travel recenter; a pointer-driven selection and a bare
 * focus-restore scroll do not.
 */
export function scrollDecision(transaction: Transaction): "center" | "default" {
  const meta = transaction.getMeta(TYPEWRITER_SCROLL);

  if (meta === "skip") {
    return "default";
  }

  if (meta === "center") {
    return "center";
  }

  if (transaction.getMeta("pointer") === true) {
    return "default";
  }

  return transaction.docChanged || transaction.selectionSet
    ? "center"
    : "default";
}

/**
 * Pads the content's bottom by half the scroller's height so the last lines
 * can reach center, re-padding and recentring on resize. Returns the
 * disengage. The top gets no padding: the caret types at its natural height
 * until its line reaches center, so scrolling up settles at the note start
 * with no blank above, and neither engaging nor disengaging can shift the
 * text.
 */
export function engageTypewriterPadding(
  scroller: HTMLElement,
  content: HTMLElement,
  recenter: () => void
): () => void {
  const applyPad = () => {
    content.style.paddingBottom = `${Math.round(scroller.clientHeight / 2)}px`;
  };

  applyPad();

  // The observer fires once at observe time with the current size, and only
  // a real resize recenters: toggle-on dispatches its own, and mount must
  // leave the restored scroll alone.
  let first = true;
  const observer = new ResizeObserver(() => {
    applyPad();

    if (first) {
      first = false;

      return;
    }

    recenter();
  });

  observer.observe(scroller);

  return () => {
    observer.disconnect();
    content.style.paddingBottom = "";
  };
}

interface TypewriterOptions {
  /** Live read of the pref -- the editor config is frozen at mount. */
  enabled: () => boolean;
  scroller: () => HTMLElement | null;
}

/**
 * Typewriter scrolling: while the pref is on, a transaction that
 * `scrollDecision` accepts replaces ProseMirror's nearest-edge scroll with a
 * short glide holding the caret line at the scroller's vertical center.
 */
export function createTypewriter(options: TypewriterOptions): Extension {
  const plugin: Plugin<"center" | "default"> = new Plugin<"center" | "default">(
    {
      props: {
        handleScrollToSelection: (view) => {
          if (!options.enabled() || view.composing) {
            return false;
          }

          if (plugin.getState(view.state) !== "center") {
            return false;
          }

          const scroller = options.scroller();

          if (scroller === null) {
            return false;
          }

          glideTo(scroller, centeredScrollTop(view, scroller));
          keepCaretInInnerScroller(view, scroller);

          return true;
        },
      },
      state: {
        apply: (transaction) => scrollDecision(transaction),
        init: () => "default",
      },
    }
  );

  return Extension.create({
    addProseMirrorPlugins: () => [plugin],
    name: "typewriter",
  });
}
