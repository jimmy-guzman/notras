import type { Editor } from "@tiptap/core";

import { Extension } from "@tiptap/core";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { common, createLowlight } from "lowlight";
import { useEffect, useState } from "react";

export interface SourceEditorHandle {
  /** Caret position as a character offset into the raw text. */
  getCursorOffset(): number;
  insertText(text: string): void;
}

interface SourceEditorProps {
  /** Character offset to place the caret at on mount. */
  initialCursor?: number;
  /** The whole raw file, frontmatter included -- frozen at mount. */
  initialValue: string;
  onChange: (content: string) => void;
  onReady?: (handle: SourceEditorHandle) => void;
}

const lowlight = createLowlight(common);

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
      "Tab": () => {
        return this.editor.commands.insertContent(INDENT);
      },
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
 * Raw markdown source mode (⌘P): the whole file in a single code block,
 * syntax-highlighted with lowlight's markdown grammar and backed by real
 * undo. The caret lands on the block you were editing (see
 * source-anchors.ts) and the same autosave drives writes.
 */
export function SourceEditor({
  initialCursor = 0,
  initialValue,
  onChange,
  onReady,
}: SourceEditorProps) {
  const [config] = useState(() => {
    return { initialCursor, initialValue, onChange, onReady };
  });

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
      Text,
      CodeBlockLowlight.configure({
        defaultLanguage: "markdown",
        exitOnArrowDown: false,
        exitOnTripleEnter: false,
        lowlight,
      }),
      UndoRedo,
      TabIndent,
    ],
    immediatelyRender: false,
    onCreate: ({ editor: instance }) => {
      instance
        .chain()
        .focus()
        .setTextSelection(caretPosition(instance, config.initialCursor))
        .scrollIntoView()
        .run();

      config.onReady?.({
        getCursorOffset: () => {
          return Math.max(0, instance.state.selection.from - 1);
        },
        insertText: (text) => {
          instance.chain().focus().insertContent(text).run();
        },
      });
    },
    onUpdate: ({ editor: instance }) => {
      config.onChange(instance.state.doc.textContent);
    },
  });

  // Focus and caret placement only work once EditorContent has attached
  // the view to the DOM, which happens before this parent effect runs.
  useEffect(() => {
    if (editor === null || editor.isDestroyed) {
      return;
    }

    editor
      .chain()
      .focus()
      .setTextSelection(caretPosition(editor, config.initialCursor))
      .scrollIntoView()
      .run();
  }, [config, editor]);

  return (
    <div className="source-editor allow-select min-h-0 flex-1 overflow-y-auto">
      <EditorContent className="min-h-full" editor={editor} />
    </div>
  );
}
