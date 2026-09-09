import type { Editor } from "@tiptap/core";

import { Extension } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { CodeBlockShiki } from "@/components/editor/code-block-shiki";
import {
  createFindHandle,
  Find,
  type FindHandle,
} from "@/components/editor/find";
import { ScrollArea } from "@/components/ui/scroll-area";
import { styleNonce } from "@/lib/style-nonce";

export interface SourceEditorHandle {
  find: FindHandle;
  focus: () => void;
  /** Caret position as a character offset into the raw text. */
  getCursorOffset: () => number;
  insertText: (text: string) => void;
}

interface SourceEditorProps {
  focusOnMount?: boolean;
  /** Character offset to place the caret at on mount. */
  initialCursor?: number;
  /** The whole raw file, frontmatter included -- frozen at mount. */
  initialValue: string;
  onChange: (content: string) => void;
  onReady?: (handle: SourceEditorHandle) => void;
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
  onReady,
}: SourceEditorProps) {
  const [config] = useState(() => ({
    focusOnMount,
    initialCursor,
    initialValue,
    onChange,
    onReady,
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
      UndoRedo,
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
      });
    },
    onUpdate: ({ editor: instance }) => {
      config.onChange(instance.state.doc.textContent);
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
