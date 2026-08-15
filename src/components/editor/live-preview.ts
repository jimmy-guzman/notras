import type { EditorState, Extension } from "@codemirror/state";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";

const hiddenMark = Decoration.replace({});
const quoteLine = Decoration.line({ class: "cm-live-quote" });

const INLINE_PARENTS = new Set([
  "Emphasis",
  "InlineCode",
  "Strikethrough",
  "StrongEmphasis",
]);

interface HiddenRange {
  from: number;
  to: number;
}

function selectionIntersects(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((range) => {
    // Inclusive boundaries: stepping onto an element reveals its marks.
    return range.from <= to && range.to >= from;
  });
}

/** Extend a mark range over a single trailing space (`## `, `> `). */
function withTrailingSpace(state: EditorState, to: number) {
  return state.sliceDoc(to, to + 1) === " " ? to + 1 : to;
}

/**
 * The mark-hiding half of live preview. `markdownHighlight` already styles
 * elements in place (big headings, real bold); this decides which syntax
 * marks to conceal, given the current selection. Pure so tests can assert
 * on the produced ranges.
 */
export function buildLivePreviewDecorations(
  state: EditorState,
  ranges: readonly { from: number; to: number }[],
): { hidden: HiddenRange[]; quoteLines: number[] } {
  const hidden: HiddenRange[] = [];
  const quoteLines = new Set<number>();

  const enter = (node: SyntaxNodeRef) => {
    switch (node.name) {
      case "CodeMark": {
        const { parent } = node.node;

        if (
          parent?.name === "InlineCode" &&
          !selectionIntersects(state, parent.from, parent.to)
        ) {
          hidden.push({ from: node.from, to: node.to });
        }

        return;
      }
      case "EmphasisMark":
      case "StrikethroughMark": {
        const { parent } = node.node;

        if (
          parent !== null &&
          INLINE_PARENTS.has(parent.name) &&
          !selectionIntersects(state, parent.from, parent.to)
        ) {
          hidden.push({ from: node.from, to: node.to });
        }

        return;
      }
      case "HeaderMark": {
        const { parent } = node.node;

        if (!parent?.name.startsWith("ATXHeading")) {
          return;
        }

        const line = state.doc.lineAt(node.from);

        if (!selectionIntersects(state, line.from, line.to)) {
          hidden.push({
            from: node.from,
            to: withTrailingSpace(state, node.to),
          });
        }

        return;
      }
      case "LinkMark":
      case "URL": {
        const { parent } = node.node;

        if (
          (parent?.name === "Link" || parent?.name === "Image") &&
          !selectionIntersects(state, parent.from, parent.to)
        ) {
          hidden.push({ from: node.from, to: node.to });
        }

        return;
      }
      case "QuoteMark": {
        const line = state.doc.lineAt(node.from);

        quoteLines.add(line.from);
        if (!selectionIntersects(state, line.from, line.to)) {
          hidden.push({
            from: node.from,
            to: withTrailingSpace(state, node.to),
          });
        }
      }
      // no default
    }
  };

  for (const range of ranges) {
    syntaxTree(state).iterate({ enter, from: range.from, to: range.to });
  }

  return {
    hidden,
    quoteLines: [...quoteLines].toSorted((a, b) => {
      return a - b;
    }),
  };
}

function toDecorationSet(
  result: ReturnType<typeof buildLivePreviewDecorations>,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const events = [
    ...result.quoteLines.map((from) => {
      return { decoration: quoteLine, from, to: from };
    }),
    ...result.hidden.map((range) => {
      return { decoration: hiddenMark, from: range.from, to: range.to };
    }),
  ].toSorted((a, b) => {
    return a.from - b.from || a.to - b.to;
  });

  for (const event of events) {
    builder.add(event.from, event.to, event.decoration);
  }

  return builder.finish();
}

/**
 * Live preview: hide markdown syntax on elements the cursor isn't touching.
 * Always on -- the source is one cursor-move away.
 */
export function livePreview(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = toDecorationSet(
          buildLivePreviewDecorations(view.state, view.visibleRanges),
        );
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged
        ) {
          this.decorations = toDecorationSet(
            buildLivePreviewDecorations(
              update.view.state,
              update.view.visibleRanges,
            ),
          );
        }
      }
    },
    {
      decorations: (instance) => {
        return instance.decorations;
      },
    },
  );
}
