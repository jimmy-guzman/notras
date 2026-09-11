import { Extension, type Extensions } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import type { Plugin, Transaction } from "@tiptap/pm/state";
import { CodeBlockShiki } from "@/components/editor/code-block-shiki";
import { Find } from "@/components/editor/find";
import { headingRange } from "@/components/editor/retitle-buffer";

const INDENT = "  ";

const TabIndent = Extension.create({
  addKeyboardShortcuts() {
    return {
      "Shift-Tab": () => {
        const { $from } = this.editor.state.selection;
        // The whole file is one code block, so parentOffset is an offset into
        // the entire document -- the current line starts after the last
        // newline before the caret, not at the start of the parent.
        const offset = $from.parentOffset;
        const text = $from.parent.textContent;
        const lineBreak =
          offset === 0 ? -1 : text.lastIndexOf("\n", offset - 1);
        const lineStart = $from.start() + lineBreak + 1;

        // Nothing to outdent -- let the browser move focus instead.
        if (
          text.slice(lineBreak + 1, lineBreak + 1 + INDENT.length) !== INDENT
        ) {
          return false;
        }

        return this.editor
          .chain()
          .deleteRange({ from: lineStart, to: lineStart + INDENT.length })
          .run();
      },
      Tab: () => this.editor.commands.insertContent(INDENT),
    };
  },
  name: "tabIndent",
});

export function touchesSourceHeading(transaction: Transaction) {
  const before = transaction.before.textContent;
  const after = transaction.doc.textContent;
  const old = headingRange(before);
  const next = headingRange(after);
  if (
    before.slice(old?.from, old?.to) !== after.slice(next?.from, next?.to) &&
    (old !== undefined || next !== undefined)
  ) {
    return true;
  }
  return transaction.steps.some((step, index) => {
    const doc = transaction.docs[index];
    const range = doc === undefined ? undefined : headingRange(doc.textContent);
    if (range === undefined) {
      return false;
    }
    let touched = false;
    step.getMap().forEach((from, to) => {
      touched ||= from - 1 <= range.to && to - 1 >= range.from;
    });
    return touched;
  });
}

/** Source editing uses the session document's schema and history. */
export function createSourceExtensions(historyPlugin: Plugin): Extensions {
  return [
    Document.extend({
      addAttributes: () => ({ name: { default: 0, rendered: false } }),
      content: "codeBlock",
    }),
    Find,
    Text,
    CodeBlockShiki.configure({
      defaultLanguage: "markdown",
      exitOnArrowDown: false,
      exitOnTripleEnter: false,
    }),
    UndoRedo.extend({ addProseMirrorPlugins: () => [historyPlugin] }),
    TabIndent,
  ];
}
