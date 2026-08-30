import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { EditorHandle } from "./editor";
import { Editor } from "./editor";

// `act` refuses to run without this, and no setup file exists to set it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let teardown: (() => void) | null = null;

afterEach(() => {
  teardown?.();
  teardown = null;
});

/**
 * Mount the editor and hand back its scroller div and handle. happy-dom
 * computes no CSS, so the observable seam is the class the stylesheet keys
 * off, the same seam TipTap's own `has-focus` is.
 */
const mount = async (modes: {
  focusModeEnabled?: boolean;
  typewriterEnabled?: boolean;
}) => {
  const host = document.createElement("div");

  document.body.append(host);

  const root = createRoot(host);
  let handle: EditorHandle | null = null;

  await act(async () => {
    root.render(
      createElement(Editor, {
        ...modes,
        initialContent: "first\n\nsecond",
        onChange: () => undefined,
        onReady: (ready) => {
          handle = ready;
        },
      })
    );
    await Promise.resolve();
  });

  // `immediatelyRender: false` creates the editor a tick after the render,
  // and the first mount in a run needs the extra flush.
  for (let flushes = 0; handle === null && flushes < 10; flushes += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each flush must land before deciding whether another is needed
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  }

  teardown = () => {
    act(() => {
      root.unmount();
    });
    host.remove();
  };

  const scroller = host.firstElementChild;

  if (!(scroller instanceof HTMLElement) || handle === null) {
    throw new Error("the editor did not mount");
  }

  return { handle: handle as EditorHandle, scroller };
};

describe("focus mode reading state", () => {
  it("should lift the dim while scrolling", async () => {
    const { scroller } = await mount({ focusModeEnabled: true });

    act(() => {
      scroller.dispatchEvent(new Event("wheel"));
    });

    expect(scroller.classList.contains("focus-mode-on")).toBe(true);
    expect(scroller.classList.contains("focus-reading")).toBe(true);
  });

  it("should restore the dim when the caret engages", async () => {
    const { handle, scroller } = await mount({ focusModeEnabled: true });

    act(() => {
      scroller.dispatchEvent(new Event("wheel"));
    });
    act(() => {
      handle.insertText("x");
    });

    expect(scroller.classList.contains("focus-reading")).toBe(false);
  });

  it("should not track reading while focus mode is off", async () => {
    const { scroller } = await mount({ focusModeEnabled: false });

    act(() => {
      scroller.dispatchEvent(new Event("wheel"));
    });

    expect(scroller.classList.contains("focus-reading")).toBe(false);
  });
});

describe("typewriter scrollbar chrome", () => {
  it("should hide the scrollbar chrome while typewriter is on", async () => {
    const { scroller } = await mount({ typewriterEnabled: true });

    expect(scroller.classList.contains("typewriter-on")).toBe(true);
  });

  it("should keep the scrollbar chrome while typewriter is off", async () => {
    const { scroller } = await mount({ typewriterEnabled: false });

    expect(scroller.classList.contains("typewriter-on")).toBe(false);
  });
});
