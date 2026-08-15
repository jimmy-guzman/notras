import type { EditorState, Extension, Range } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";

import { syntaxTree } from "@codemirror/language";
import { StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

import {
  BulletWidget,
  CheckboxWidget,
  HrWidget,
  ImageWidget,
  TableWidget,
} from "./live-preview-widgets";

export type LivePreviewOp =
  | { alt: string; from: number; kind: "image"; src: string; to: number }
  | {
      checked: boolean;
      from: number;
      kind: "checkbox";
      /** Range of the raw `[ ]`/`[x]` marker, rewritten on toggle. */
      markerFrom: number;
      markerTo: number;
      to: number;
    }
  | {
      from: number;
      header: string[];
      kind: "table";
      rows: string[][];
      to: number;
    }
  | { from: number; kind: "bullet"; to: number }
  | { from: number; kind: "codeLine" }
  | { from: number; kind: "fenceLine"; to: number }
  | { from: number; kind: "hide"; to: number }
  | { from: number; kind: "hr"; to: number }
  | { from: number; kind: "quoteLine" }
  | { from: number; kind: "taskDone"; to: number };

export interface LivePreviewOptions {
  /** Resolve image sources (e.g. `attachments/x.png`) to loadable URLs. */
  resolveImageSrc?: (src: string) => string;
}

const INLINE_PARENTS = new Set([
  "Emphasis",
  "InlineCode",
  "Strikethrough",
  "StrongEmphasis",
]);

function selectionIntersects(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((range) => {
    // Inclusive boundaries: stepping onto an element reveals its marks.
    return range.from <= to && range.to >= from;
  });
}

function lineRevealed(state: EditorState, pos: number) {
  const line = state.doc.lineAt(pos);

  return selectionIntersects(state, line.from, line.to);
}

/** Extend a mark range over a single trailing space (`## `, `> `). */
function withTrailingSpace(state: EditorState, to: number) {
  return state.sliceDoc(to, to + 1) === " " ? to + 1 : to;
}

function tableCells(state: EditorState, row: null | SyntaxNode) {
  if (row === null) {
    return [];
  }

  return row.getChildren("TableCell").map((cell) => {
    return state.sliceDoc(cell.from, cell.to).trim();
  });
}

/**
 * The decision half of live preview: which syntax gets hidden or replaced
 * by widgets, given the current selection. `markdownHighlight` styles
 * elements in place; these ops complete the rendered feel. Pure so tests
 * can assert on the produced ops.
 */
export function buildLivePreviewOps(state: EditorState): LivePreviewOp[] {
  const ops: LivePreviewOp[] = [];

  const enter = (node: SyntaxNodeRef): boolean | undefined => {
    switch (node.name) {
      case "CodeMark": {
        const { parent } = node.node;

        if (
          parent?.name === "InlineCode" &&
          !selectionIntersects(state, parent.from, parent.to)
        ) {
          ops.push({ from: node.from, kind: "hide", to: node.to });
        }

        return undefined;
      }
      case "EmphasisMark":
      case "StrikethroughMark": {
        const { parent } = node.node;

        if (
          parent !== null &&
          INLINE_PARENTS.has(parent.name) &&
          !selectionIntersects(state, parent.from, parent.to)
        ) {
          ops.push({ from: node.from, kind: "hide", to: node.to });
        }

        return undefined;
      }
      case "FencedCode": {
        const firstLine = state.doc.lineAt(node.from);
        const lastLine = state.doc.lineAt(node.to);

        for (
          let lineNumber = firstLine.number;
          lineNumber <= lastLine.number;
          lineNumber += 1
        ) {
          ops.push({ from: state.doc.line(lineNumber).from, kind: "codeLine" });
        }

        const hasClosingFence = node.node.getChildren("CodeMark").length >= 2;

        if (!selectionIntersects(state, node.from, node.to)) {
          ops.push({
            from: firstLine.from,
            kind: "fenceLine",
            to: firstLine.to,
          });
          if (hasClosingFence) {
            ops.push({
              from: lastLine.from,
              kind: "fenceLine",
              to: lastLine.to,
            });
          }
        }

        return false;
      }
      case "HeaderMark": {
        const { parent } = node.node;

        if (!parent?.name.startsWith("ATXHeading")) {
          return undefined;
        }

        if (!lineRevealed(state, node.from)) {
          ops.push({
            from: node.from,
            kind: "hide",
            to: withTrailingSpace(state, node.to),
          });
        }

        return undefined;
      }
      case "HorizontalRule": {
        if (!lineRevealed(state, node.from)) {
          ops.push({ from: node.from, kind: "hr", to: node.to });
        }

        return undefined;
      }
      case "Image": {
        if (selectionIntersects(state, node.from, node.to)) {
          return undefined;
        }

        const url = node.node.getChild("URL");
        const text = state.sliceDoc(node.from, node.to);
        const alt = /^!\[([^\]]*)\]/.exec(text)?.[1] ?? "";

        ops.push({
          alt,
          from: node.from,
          kind: "image",
          src: url === null ? "" : state.sliceDoc(url.from, url.to),
          to: node.to,
        });

        return false;
      }
      case "LinkMark":
      case "URL": {
        const { parent } = node.node;

        if (
          parent?.name === "Link" &&
          !selectionIntersects(state, parent.from, parent.to)
        ) {
          ops.push({ from: node.from, kind: "hide", to: node.to });
        }

        return undefined;
      }
      case "ListMark": {
        const item = node.node.parent;

        if (
          item?.name !== "ListItem" ||
          item.parent?.name !== "BulletList" ||
          item.getChild("Task") !== null
        ) {
          return undefined;
        }

        if (!lineRevealed(state, node.from)) {
          ops.push({ from: node.from, kind: "bullet", to: node.to });
        }

        return undefined;
      }
      case "QuoteMark": {
        const line = state.doc.lineAt(node.from);

        ops.push({ from: line.from, kind: "quoteLine" });
        if (!selectionIntersects(state, line.from, line.to)) {
          ops.push({
            from: node.from,
            kind: "hide",
            to: withTrailingSpace(state, node.to),
          });
        }

        return undefined;
      }
      case "Table": {
        if (selectionIntersects(state, node.from, node.to)) {
          return undefined;
        }

        const header = tableCells(state, node.node.getChild("TableHeader"));
        const rows = node.node.getChildren("TableRow").map((row) => {
          return tableCells(state, row);
        });

        ops.push({
          from: state.doc.lineAt(node.from).from,
          header,
          kind: "table",
          rows,
          to: state.doc.lineAt(node.to).to,
        });

        return false;
      }
      case "TaskMarker": {
        const task = node.node.parent;
        const item = task?.parent;
        const listMark = item?.getChild("ListMark");
        const checked = state
          .sliceDoc(node.from, node.to)
          .toLowerCase()
          .includes("x");

        if (task === null || item === null) {
          return undefined;
        }

        if (!lineRevealed(state, node.from)) {
          ops.push({
            checked,
            from: listMark?.from ?? node.from,
            kind: "checkbox",
            markerFrom: node.from,
            markerTo: node.to,
            to: withTrailingSpace(state, node.to),
          });
        }

        const textFrom = withTrailingSpace(state, node.to);

        if (checked && textFrom < task.to) {
          ops.push({ from: textFrom, kind: "taskDone", to: task.to });
        }
      }
      // no default
    }

    return undefined;
  };

  syntaxTree(state).iterate({ enter });

  return ops;
}

const hiddenMark = Decoration.replace({});
const quoteLine = Decoration.line({ class: "cm-live-quote" });
const codeLine = Decoration.line({ class: "cm-live-code" });
const taskDone = Decoration.mark({ class: "cm-task-done" });

function toDecorationSet(
  ops: LivePreviewOp[],
  options: LivePreviewOptions,
): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const op of ops) {
    switch (op.kind) {
      case "bullet": {
        ranges.push(
          Decoration.replace({ widget: new BulletWidget() }).range(
            op.from,
            op.to,
          ),
        );

        break;
      }
      case "checkbox": {
        ranges.push(
          Decoration.replace({
            widget: new CheckboxWidget(op.checked, op.markerFrom, op.markerTo),
          }).range(op.from, op.to),
        );

        break;
      }
      case "codeLine": {
        ranges.push(codeLine.range(op.from));

        break;
      }
      case "fenceLine": {
        ranges.push(Decoration.replace({ block: true }).range(op.from, op.to));

        break;
      }
      case "hide": {
        ranges.push(hiddenMark.range(op.from, op.to));

        break;
      }
      case "hr": {
        ranges.push(
          Decoration.replace({ widget: new HrWidget() }).range(op.from, op.to),
        );

        break;
      }
      case "image": {
        ranges.push(
          Decoration.replace({
            widget: new ImageWidget(
              options.resolveImageSrc?.(op.src) ?? op.src,
              op.alt,
            ),
          }).range(op.from, op.to),
        );

        break;
      }
      case "quoteLine": {
        ranges.push(quoteLine.range(op.from));

        break;
      }
      case "table": {
        ranges.push(
          Decoration.replace({
            block: true,
            widget: new TableWidget(op.header, op.rows),
          }).range(op.from, op.to),
        );

        break;
      }
      case "taskDone": {
        ranges.push(taskDone.range(op.from, op.to));

        break;
      }
      // no default
    }
  }

  return Decoration.set(ranges, true);
}

/**
 * Live preview: hide markdown syntax and render widgets (bullets,
 * checkboxes, code cards, rules, images, tables) on elements the cursor
 * isn't touching. Always on -- the source is one cursor-move away. A
 * StateField rather than a ViewPlugin because block decorations (hidden
 * fence lines, table widgets) may not come from plugins.
 */
export function livePreview(options: LivePreviewOptions = {}): Extension {
  const build = (state: EditorState) => {
    return toDecorationSet(buildLivePreviewOps(state), options);
  };

  return StateField.define<DecorationSet>({
    create: build,
    provide: (field) => {
      return EditorView.decorations.from(field);
    },
    update: (decorations, transaction) => {
      if (transaction.docChanged || transaction.selection !== undefined) {
        return build(transaction.state);
      }

      return decorations;
    },
  });
}
