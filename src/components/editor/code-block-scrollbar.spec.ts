import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { createEditorExtensions } from "./extensions";

/**
 * A code block with one long line and a paragraph after it, with the caret in
 * the paragraph and the code reporting more content than room, since
 * happy-dom lays nothing out.
 */
function mountWideCode() {
  const host = document.createElement("div");
  document.body.append(host);

  const editor = new Editor({
    content: `\`\`\`\n${"wide ".repeat(60)}\n\`\`\`\n\nafter`,
    contentType: "markdown",
    element: host,
    extensions: createEditorExtensions({}),
  });

  editor.commands.focus("end");

  const pre = editor.view.dom.querySelector<HTMLElement>(
    ".code-block-wrapper > pre"
  );

  if (pre === null) {
    throw new Error("the code block has no pre");
  }

  Object.defineProperty(pre, "scrollWidth", {
    configurable: true,
    value: 1200,
  });
  Object.defineProperty(pre, "clientWidth", { value: 600 });

  const bar = editor.view.dom.querySelector<HTMLElement>(
    '.code-block-wrapper > [data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]'
  );

  const thumb = bar?.querySelector<HTMLElement>(
    '[data-slot="scroll-area-thumb"]'
  );

  if (bar === null || thumb === undefined || thumb === null) {
    throw new Error("the code block has no scrollbar");
  }

  return { bar, editor, pre, thumb };
}

describe("code block scrollbar", () => {
  it("should show the bar for a sideways scroll that follows a keystroke", async () => {
    const { bar, editor, pre } = mountWideCode();

    // Only the scroll is explicit: happy-dom has no layout for the key to move.
    await userEvent.setup().keyboard("{ArrowUp}");
    pre.scrollLeft = 120;
    pre.dispatchEvent(new Event("scroll"));

    expect(bar).toHaveAttribute("data-scrolling");
    editor.destroy();
  });

  it("should keep the bar hidden for a scroll no one asked for", () => {
    const { bar, editor, pre } = mountWideCode();

    pre.scrollLeft = 120;
    pre.dispatchEvent(new Event("scroll"));

    expect(bar).not.toHaveAttribute("data-scrolling");
    editor.destroy();
  });

  it("should keep the bar out of the accessibility tree", () => {
    const { bar, editor } = mountWideCode();

    expect(bar).toHaveAttribute("aria-hidden", "true");
    editor.destroy();
  });

  it("should draw the thumb", () => {
    const { editor, thumb } = mountWideCode();

    expect(thumb.style.visibility).toBe("");
    editor.destroy();
  });

  it("should hide the bar once scrolling rests", () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const { bar, editor, pre } = mountWideCode();

    pre.dispatchEvent(new WheelEvent("wheel", { deltaX: 120 }));
    pre.scrollLeft = 120;
    pre.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(499);

    expect(bar).toHaveAttribute("data-scrolling");

    vi.advanceTimersByTime(1);

    expect(bar).not.toHaveAttribute("data-scrolling");
    editor.destroy();
  });

  it("should keep the bar hidden when a shortened line clamps the block back", async () => {
    const { bar, editor, pre } = mountWideCode();

    Object.defineProperty(pre, "scrollWidth", { value: 600 });
    await userEvent.setup().keyboard("{Backspace}");
    pre.scrollLeft = 0;
    pre.dispatchEvent(new Event("scroll"));

    expect(bar).not.toHaveAttribute("data-scrolling");
    editor.destroy();
  });

  it("should hide a showing bar when a shortened line clamps the block back", () => {
    const { bar, editor, pre } = mountWideCode();

    pre.dispatchEvent(new WheelEvent("wheel", { deltaX: 120 }));
    pre.scrollLeft = 120;
    pre.dispatchEvent(new Event("scroll"));
    Object.defineProperty(pre, "scrollWidth", { value: 600 });
    pre.scrollLeft = 0;
    pre.dispatchEvent(new Event("scroll"));

    expect(bar).not.toHaveAttribute("data-scrolling");
    editor.destroy();
  });

  it("should scroll the code as the thumb is dragged", async () => {
    const { bar, editor, pre, thumb } = mountWideCode();

    // The track is as wide as the code, so the thumb covers half of it and a
    // pixel of thumb travel is two of code.
    Object.defineProperty(bar, "clientWidth", { value: 600 });
    await userEvent.setup().pointer([
      { coords: { clientX: 100 }, keys: "[MouseLeft>]", target: thumb },
      { coords: { clientX: 130 }, target: thumb },
    ]);

    expect(pre.scrollLeft).toBe(60);
    editor.destroy();
  });

  it("should end a drag on a move with the button up", () => {
    const { bar, editor, pre, thumb } = mountWideCode();

    // Without room for the thumb to travel, no drag would scroll at all.
    Object.defineProperty(bar, "clientWidth", { value: 600 });
    thumb.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 100,
      })
    );
    thumb.dispatchEvent(
      new PointerEvent("pointermove", { buttons: 0, clientX: 130 })
    );
    thumb.dispatchEvent(
      new PointerEvent("pointermove", { buttons: 1, clientX: 160 })
    );

    expect(pre.scrollLeft).toBe(0);
    editor.destroy();
  });

  it("should scroll the code for a wheel over the bar", () => {
    const { bar, editor, pre } = mountWideCode();

    bar.dispatchEvent(new WheelEvent("wheel", { deltaX: 40 }));

    expect(pre.scrollLeft).toBe(40);
    editor.destroy();
  });
});
