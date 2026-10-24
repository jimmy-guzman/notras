import { CSPProvider } from "@base-ui/react/csp-provider";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { ScrollBar } from "@/components/ui/scroll-area";
import { styleNonce } from "@/lib/style-nonce";

// Base UI's floor for the thumb, its idle time before the bar fades, and its
// reading of a scroll's end as 100ms without another scroll event.
const MIN_THUMB_WIDTH = 16;
const SCROLL_TIMEOUT = 500;
const SCROLL_END = 100;

// A code block has to be whole in ProseMirror's own pass, before React
// renders, so the bar the note and a table scroll behind renders once as the
// module evaluates and each block takes a clone of it. This root sits outside
// main.tsx's tree, so it needs its own CSPProvider: React hoists Base UI's
// native-scrollbar-hiding style by href, and the first copy mounted keeps the
// shared node, nonce or not.
const rendered = document.createElement("div");

createRoot(rendered).render(
  createElement(
    CSPProvider,
    { nonce: styleNonce },
    createElement(
      ScrollAreaPrimitive.Root,
      null,
      createElement(ScrollBar, { keepMounted: true, orientation: "horizontal" })
    )
  )
);

/**
 * The editor's horizontal scrollbar for a code block's `pre`, driven the way
 * Base UI drives a scroll area's: it shows for a scroll the person caused, by
 * wheel, pointer or a key in `host`, and fades once scrolling rests.
 */
export function codeBlockScrollbar(pre: HTMLElement, host: HTMLElement) {
  const bar = rendered
    .querySelector('[data-slot="scroll-area-scrollbar"]')
    ?.cloneNode(true);

  if (!(bar instanceof HTMLElement)) {
    throw new TypeError("The code block scrollbar did not render");
  }

  const thumb = bar.querySelector<HTMLElement>(
    '[data-slot="scroll-area-thumb"]'
  );

  if (thumb === null) {
    throw new Error("The code block scrollbar has no thumb");
  }

  // Base UI hides the thumb until its root measures a viewport, and the root
  // this was cloned from has none.
  thumb.style.removeProperty("visibility");

  let theirs = false;
  let drag: { pointer: number; scroll: number; x: number } | undefined;
  let endTimer: number | undefined;
  let idleTimer: number | undefined;

  // The thumb's offset is the bar's padding, the same on both ends.
  const geometry = () => {
    const track = bar.clientWidth - 2 * thumb.offsetLeft;

    const width = Math.max(
      MIN_THUMB_WIDTH,
      (track * pre.clientWidth) / pre.scrollWidth
    );

    return {
      range: pre.scrollWidth - pre.clientWidth,
      room: track - width,
      width,
    };
  };

  const draw = () => {
    const { range, room, width } = geometry();

    bar.style.setProperty("--scroll-area-thumb-width", `${width}px`);
    thumb.style.transform = `translate3d(${(pre.scrollLeft / range) * room}px,0,0)`;
  };

  const show = () => {
    bar.dataset.scrolling = "";
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      delete bar.dataset.scrolling;
    }, SCROLL_TIMEOUT);
  };

  const markTheirs = () => {
    theirs = true;
  };

  const release = (event: PointerEvent) => {
    if (drag?.pointer !== event.pointerId) {
      return;
    }

    drag = undefined;
    window.clearTimeout(idleTimer);
    delete bar.dataset.scrolling;

    if (thumb.hasPointerCapture(event.pointerId)) {
      thumb.releasePointerCapture(event.pointerId);
    }
  };

  pre.addEventListener("wheel", markTheirs, { passive: true });
  pre.addEventListener("pointermove", markTheirs);
  host.addEventListener("keydown", markTheirs);
  pre.addEventListener("scroll", () => {
    // Shortening the line a block was scrolled along clamps it back, and a
    // block that no longer overflows has no bar to show.
    if (pre.scrollWidth <= pre.clientWidth) {
      window.clearTimeout(idleTimer);
      delete bar.dataset.scrolling;

      return;
    }

    draw();

    if (theirs) {
      show();
    }

    window.clearTimeout(endTimer);
    endTimer = window.setTimeout(() => {
      theirs = false;
    }, SCROLL_END);
  });

  // A press on the track jumps the thumb's centre to it, then drags from there.
  bar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    theirs = true;

    if (!(event.target instanceof Node && thumb.contains(event.target))) {
      const { range, room, width } = geometry();

      if (room > 0) {
        pre.scrollLeft =
          ((event.clientX -
            bar.getBoundingClientRect().left -
            thumb.offsetLeft -
            width / 2) /
            room) *
          range;
      }
    }

    drag = {
      pointer: event.pointerId,
      scroll: pre.scrollLeft,
      x: event.clientX,
    };
    thumb.setPointerCapture(event.pointerId);
  });
  thumb.addEventListener("pointermove", (event) => {
    if (drag?.pointer !== event.pointerId) {
      return;
    }

    // WebKit can drop the capture, and with it the release, while the bar is
    // hidden; a move with the button up is that missed release.
    if (event.buttons % 2 === 0) {
      release(event);

      return;
    }

    const { range, room } = geometry();

    if (room > 0) {
      pre.scrollLeft = drag.scroll + ((event.clientX - drag.x) / room) * range;
    }
  });
  thumb.addEventListener("pointerup", release);
  thumb.addEventListener("pointercancel", release);
  // A native scrollbar takes no focus when pressed, so the caret stays put.
  bar.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  // A wheel over the bar scrolls the code, and at an edge passes to the note.
  bar.addEventListener(
    "wheel",
    (event) => {
      const before = pre.scrollLeft;

      theirs = true;
      pre.scrollLeft += event.deltaX;

      if (pre.scrollLeft !== before) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  return {
    bar,
    destroy: () => {
      window.clearTimeout(endTimer);
      window.clearTimeout(idleTimer);
      host.removeEventListener("keydown", markTheirs);
    },
  };
}
