import type { Editor } from "@tiptap/core";

import { Extension } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import type { Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { CodeBlockShiki } from "@/components/editor/code-block-shiki";
import {
  createFindHandle,
  Find,
  type FindHandle,
} from "@/components/editor/find";
import { ScrollArea } from "@/components/ui/scroll-area";
import { styleNonce } from "@/lib/style-nonce";
import type { DocumentEdit } from "./note-document";
import { headingRange } from "./retitle-buffer";

function touchesSourceHeading(transaction: Transaction) {
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

export interface SourceEditorHandle {
  find: FindHandle;
  focus: () => void;
  /** Caret position as a character offset into the raw text. */
  getCursorOffset: () => number;
  insertText: (text: string) => void;
  replaceContent: (
    content: string,
    selection?: { anchor: number; head: number }
  ) => void;
}

interface SourceEditorProps {
  focusOnMount?: boolean;
  /** Character offset to place the caret at on mount. */
  initialCursor?: number;
  /** The whole raw file, frontmatter included -- frozen at mount. */
  initialValue: string;
  onChange: (content: string, edit: DocumentEdit) => void;
  onHistory?: (direction: "undo" | "redo", execute: boolean) => boolean;
  onReady?: (handle: SourceEditorHandle) => void;
  onSelect?: (anchor: number, head: number) => void;
}

const SourceDocument = Document.extend({
  content: "codeBlock",
});

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

/** Clamp a source offset to a caret position inside the code block. */
function caretPosition(editor: Editor, offset: number) {
  const max = Math.max(1, editor.state.doc.content.size - 1);

  return Math.max(1, Math.min(1 + offset, max));
}

/**
 * Raw markdown source mode (⌘E): the whole file in a single code block,
 * syntax-highlighted with Shiki's markdown grammar and backed by real
 * undo. The caret lands on the block you were editing (see sentinel.ts) and
 * the same autosave drives writes.
 */
export function SourceEditor({
  focusOnMount,
  initialCursor = 0,
  initialValue,
  onChange,
  onHistory,
  onSelect,
  onReady,
}: SourceEditorProps) {
  const suppressChange = useRef(false);
  const [config] = useState(() => ({
    focusOnMount,
    initialCursor,
    initialValue,
    onChange,
    onHistory,
    onReady,
    onSelect,
  }));

  const editor = useEditor({
    content: {
      content: [
        {
          attrs: { language: "markdown" },
          content:
            config.initialValue === ""
              ? []
              : [{ text: config.initialValue, type: "text" }],
          type: "codeBlock",
        },
      ],
      type: "doc",
    },
    editorProps: {
      attributes: {
        autocapitalize: "off",
        autocorrect: "off",
        class: "mx-auto w-full max-w-2xl px-6 py-6 focus:outline-none",
        spellcheck: "false",
      },
    },
    extensions: [
      SourceDocument,
      Find,
      Text,
      CodeBlockShiki.configure({
        defaultLanguage: "markdown",
        exitOnArrowDown: false,
        exitOnTripleEnter: false,
      }),
      config.onHistory === undefined
        ? UndoRedo
        : UndoRedo.extend({
            addCommands: () => ({
              redo:
                () =>
                ({ dispatch, tr }: import("@tiptap/core").CommandProps) => {
                  tr.setMeta("preventDispatch", true);
                  return (
                    config.onHistory?.("redo", dispatch !== undefined) ?? false
                  );
                },
              undo:
                () =>
                ({ dispatch, tr }: import("@tiptap/core").CommandProps) => {
                  tr.setMeta("preventDispatch", true);
                  return (
                    config.onHistory?.("undo", dispatch !== undefined) ?? false
                  );
                },
            }),
            addProseMirrorPlugins: () => [],
          }),
      TabIndent,
    ],
    immediatelyRender: false,
    injectNonce: styleNonce,
    onCreate: ({ editor: instance }) => {
      config.onReady?.({
        find: createFindHandle(instance),
        focus: () => {
          if (!instance.isDestroyed) {
            instance.commands.focus();
          }
        },
        getCursorOffset: () =>
          instance.isDestroyed
            ? -1
            : Math.max(0, instance.state.selection.from - 1),
        insertText: (text) => {
          if (!instance.isDestroyed) {
            instance.chain().focus().insertContent(text).run();
          }
        },
        replaceContent: (content, selection) => {
          if (instance.isDestroyed) {
            return;
          }
          const before = instance.state.doc.textContent;
          let from = 0;
          while (
            from < before.length &&
            from < content.length &&
            before[from] === content[from]
          ) {
            from += 1;
          }
          let end = before.length;
          let nextEnd = content.length;
          while (
            end > from &&
            nextEnd > from &&
            before[end - 1] === content[nextEnd - 1]
          ) {
            end -= 1;
            nextEnd -= 1;
          }
          const transaction = instance.state.tr.insertText(
            content.slice(from, nextEnd),
            from + 1,
            end + 1
          );
          if (selection !== undefined) {
            transaction.setSelection(
              TextSelection.create(
                transaction.doc,
                Math.min(selection.anchor, content.length) + 1,
                Math.min(selection.head, content.length) + 1
              )
            );
          }
          suppressChange.current = true;
          try {
            instance.view.dispatch(transaction.setMeta("addToHistory", false));
          } finally {
            suppressChange.current = false;
          }
        },
      });
    },
    onSelectionUpdate: ({ editor: instance }) => {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: this mutable ref changes in editor and mode-switch callbacks
      if (!suppressChange.current) {
        config.onSelect?.(
          instance.state.selection.anchor - 1,
          instance.state.selection.head - 1
        );
      }
    },
    onTransaction: ({
      editor: instance,
      transaction,
      appendedTransactions,
    }) => {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: this mutable ref changes in editor and mode-switch callbacks
      if (suppressChange.current || transaction.getMeta("preventUpdate")) {
        return;
      }
      const transactions = [transaction, ...appendedTransactions];
      if (transactions.some((entry) => entry.docChanged)) {
        config.onChange(instance.state.doc.textContent, {
          headingEdited: transactions.some(touchesSourceHeading),
          selection: {
            anchor: instance.state.selection.anchor - 1,
            head: instance.state.selection.head - 1,
          },
        });
      }
    },
  });

  // Caret placement only works once EditorContent has attached the view to the
  // DOM, which happens before this parent effect runs.
  useEffect(() => {
    if (editor === null || editor.isDestroyed) {
      return;
    }

    const chain = editor.chain();

    // A tab mounted in the background places its caret without taking focus:
    // every open tab keeps a live editor and only one is showing.
    if (config.focusOnMount === true) {
      chain.focus();
    }

    chain
      .setTextSelection(caretPosition(editor, config.initialCursor))
      .scrollIntoView()
      .run();
  }, [config, editor]);

  return (
    <ScrollArea className="source-editor allow-select min-h-0 flex-1">
      <EditorContent className="min-h-full" editor={editor} />
    </ScrollArea>
  );
}
