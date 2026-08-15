import type { Extension } from "@codemirror/state";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";

import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";

const activeLine = Decoration.line({ class: "cm-focus-active" });

/** Highlight the run of non-blank lines around the cursor. */
function buildActiveParagraph(view: EditorView) {
  const { doc } = view.state;
  const cursorLine = doc.lineAt(view.state.selection.main.head);

  let first = cursorLine.number;

  while (first > 1 && doc.line(first - 1).text.trim() !== "") {
    first -= 1;
  }
  let last = cursorLine.number;

  while (last < doc.lines && doc.line(last + 1).text.trim() !== "") {
    last += 1;
  }

  const builder = [];

  for (let lineNumber = first; lineNumber <= last; lineNumber += 1) {
    builder.push(activeLine.range(doc.line(lineNumber).from));
  }

  return Decoration.set(builder);
}

/**
 * Focus mode: dim every paragraph except the one the cursor is in. A
 * paragraph is the run of non-blank lines around the cursor.
 */
export function focusMode(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildActiveParagraph(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) {
          this.decorations = buildActiveParagraph(update.view);
        }
      }
    },
    {
      decorations: (instance) => {
        return instance.decorations;
      },
    },
  );

  return [plugin, EditorView.editorAttributes.of({ class: "cm-focus-mode" })];
}

/**
 * Typewriter scrolling: while typing, keep the cursor line vertically
 * centered.
 */
export function typewriterScrolling(): Extension {
  return EditorView.updateListener.of((update) => {
    const typed = update.transactions.some((tr) => {
      return tr.isUserEvent("input") || tr.isUserEvent("delete");
    });

    if (!typed) {
      return;
    }

    const { head } = update.state.selection.main;

    requestAnimationFrame(() => {
      update.view.dispatch({
        effects: EditorView.scrollIntoView(head, { y: "center" }),
      });
    });
  });
}
