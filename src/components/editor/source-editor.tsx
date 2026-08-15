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

const TabIndent = Extension.create({
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        return this.editor.commands.insertContent("  ");
      },
    };
  },
  name: "tabIndent",
});

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
      const max = instance.state.doc.content.size - 1;
      const pos = Math.max(1, Math.min(1 + config.initialCursor, max));

      instance.chain().focus().setTextSelection(pos).scrollIntoView().run();

      config.onReady?.({
        getCursorOffset: () => {
          return Math.max(0, instance.state.selection.from - 1);
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

    const max = Math.max(1, editor.state.doc.content.size - 1);
    const pos = Math.max(1, Math.min(1 + config.initialCursor, max));

    editor.chain().focus().setTextSelection(pos).scrollIntoView().run();
  }, [config, editor]);

  return (
    <div className="source-editor allow-select min-h-0 flex-1 overflow-y-auto">
      <EditorContent className="min-h-full" editor={editor} />
    </div>
  );
}
