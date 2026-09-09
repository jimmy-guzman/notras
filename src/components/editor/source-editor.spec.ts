import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceEditorHandle } from "@/components/editor/source-editor";
import { SourceEditor } from "@/components/editor/source-editor";

// React requires this flag for a root driven by act outside a browser runner.
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

it("should retain source text and caret while highlighting and inserting text", async ({
  onTestFinished,
}) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const changes: string[] = [];
  let handle: SourceEditorHandle | undefined;
  const source =
    "---\npinned: true\n...\n# a title\n\n```ts\nconst value = 1;\n```";
  onTestFinished(() => {
    act(() => root.unmount());
    container.remove();
  });

  await act(() => {
    root.render(
      createElement(SourceEditor, {
        initialCursor: 4,
        initialValue: source,
        onChange: (text) => changes.push(text),
        onReady: (ready) => {
          handle = ready;
        },
      })
    );
  });
  await act(async () => {
    await vi.waitFor(() => {
      expect(handle).toBeDefined();
      expect(container.querySelector(".syntax-token")).not.toBeNull();
    });
  });

  if (handle === undefined) {
    throw new Error("source editor did not become ready");
  }
  expect(container.querySelector("pre")?.textContent).toBe(source);
  expect(handle.getCursorOffset()).toBe(4);
  expect(changes).toEqual([]);

  act(() => handle?.insertText("# a comment\n"));
  expect(changes).toEqual([
    "---\n# a comment\npinned: true\n...\n# a title\n\n```ts\nconst value = 1;\n```",
  ]);
  expect(handle.getCursorOffset()).toBe(16);
});
