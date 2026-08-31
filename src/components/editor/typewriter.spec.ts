import type { EditorEvents } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createEditorExtensions } from "./extensions";
import { scrollDecision, TYPEWRITER_SCROLL } from "./typewriter";

function makeEditor(content: string) {
  return new Editor({
    content,
    contentType: "markdown",
    element: document.createElement("div"),
    extensions: createEditorExtensions({}),
  });
}

/**
 * The decision the typewriter plugin holds after `act`'s dispatch: plugin
 * state applies per transaction, so the last one in the group (appended
 * transactions included) is what `handleScrollToSelection` reads.
 */
function decisionAfter(editor: Editor, act: () => void) {
  const seen: EditorEvents["transaction"][] = [];
  const record = (event: EditorEvents["transaction"]) => {
    seen.push(event);
  };

  editor.on("transaction", record);
  act();
  editor.off("transaction", record);

  const group = seen.at(-1);

  if (group === undefined) {
    throw new Error("nothing was dispatched");
  }

  const last = group.appendedTransactions.at(-1) ?? group.transaction;

  return scrollDecision(last);
}

describe("typewriter scroll decision", () => {
  it("should recenter for a typing transaction", () => {
    const editor = makeEditor("first line\n\nsecond line");

    expect(
      decisionAfter(editor, () => {
        editor.commands.insertContent("x");
      })
    ).toBe("center");

    editor.destroy();
  });

  it("should recenter for undo", () => {
    const editor = makeEditor("first line\n\nsecond line");

    editor.commands.insertContent("x");

    expect(
      decisionAfter(editor, () => {
        editor.commands.undo();
      })
    ).toBe("center");

    editor.destroy();
  });

  it("should recenter for redo", () => {
    const editor = makeEditor("first line\n\nsecond line");

    editor.commands.insertContent("x");
    editor.commands.undo();

    expect(
      decisionAfter(editor, () => {
        editor.commands.redo();
      })
    ).toBe("center");

    editor.destroy();
  });

  it("should recenter for keyboard caret travel", () => {
    const editor = makeEditor("first line\n\nsecond line");

    expect(
      decisionAfter(editor, () => {
        editor.view.dispatch(
          editor.state.tr
            .setSelection(TextSelection.create(editor.state.doc, 2))
            .scrollIntoView()
        );
      })
    ).toBe("center");

    editor.destroy();
  });

  it("should not recenter for a mouse-driven selection", () => {
    const editor = makeEditor("first line\n\nsecond line");

    expect(
      decisionAfter(editor, () => {
        editor.view.dispatch(
          editor.state.tr
            .setSelection(TextSelection.create(editor.state.doc, 2))
            .setMeta("pointer", true)
        );
      })
    ).toBe("default");

    editor.destroy();
  });

  it("should not recenter for the mount-time caret restore", () => {
    const editor = makeEditor("first line\n\nsecond line");

    expect(
      decisionAfter(editor, () => {
        editor
          .chain()
          .setTextSelection(2)
          .setMeta(TYPEWRITER_SCROLL, "skip")
          .scrollIntoView()
          .run();
      })
    ).toBe("default");

    editor.destroy();
  });

  it("should not recenter for a bare focus scroll", () => {
    const editor = makeEditor("first line\n\nsecond line");

    expect(
      decisionAfter(editor, () => {
        editor.view.dispatch(editor.state.tr.scrollIntoView());
      })
    ).toBe("default");

    editor.destroy();
  });

  it("should recenter when the toggle asks for a recenter", () => {
    const editor = makeEditor("first line\n\nsecond line");

    expect(
      decisionAfter(editor, () => {
        editor
          .chain()
          .setMeta(TYPEWRITER_SCROLL, "center")
          .scrollIntoView()
          .run();
      })
    ).toBe("center");

    editor.destroy();
  });
});
