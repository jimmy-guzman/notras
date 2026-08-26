import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { SourceEditor } from "./source-editor";

// `act` refuses to run without this, and no setup file exists to set it.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let teardown: (() => void) | null = null;

afterEach(() => {
  teardown?.();
  teardown = null;
});

/**
 * Mount the editor beside an already-focused button. The caret lands in a mount
 * effect, so the render has to be flushed before focus is read.
 */
const mountBeside = async (focusOnMount: boolean) => {
  const button = document.createElement("button");
  const host = document.createElement("div");

  document.body.append(button, host);
  button.focus();

  const root = createRoot(host);

  await act(async () => {
    root.render(
      createElement(SourceEditor, {
        focusOnMount,
        initialValue: "---\npinned: true\n---\n# a title",
        onChange: () => undefined,
      })
    );
    await Promise.resolve();
  });

  teardown = () => {
    act(() => {
      root.unmount();
    });
    button.remove();
    host.remove();
  };

  return { button, host };
};

describe("source editor focus", () => {
  it("should leave focus alone when it is not the active surface", async () => {
    const { button } = await mountBeside(false);

    expect(document.activeElement).toBe(button);
  });

  it("should take focus when mounted as the active surface", async () => {
    const { host } = await mountBeside(true);

    expect(document.activeElement).toBe(host.querySelector(".ProseMirror"));
  });
});
