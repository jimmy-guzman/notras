import type { Editor } from "@tiptap/core";
import { useLayoutEffect, useRef, useState } from "react";
import { createFindHandle, type FindHandle } from "@/components/editor/find";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface SourceEditorHandle {
  find: FindHandle;
  focus: () => void;
  /** Caret position as a character offset into the raw text. */
  getCursorOffset: () => number;
  insertText: (text: string) => void;
}

interface SourceEditorProps {
  editor: Editor;
  focusOnMount?: boolean;
  initialCursor?: number;
  onReady?: (handle: SourceEditorHandle) => void;
}

/** Attach a source view to the session's existing text state and history. */
export function SourceEditor({
  editor,
  focusOnMount,
  initialCursor = 0,
  onReady,
}: SourceEditorProps) {
  const [config] = useState(() => ({ focusOnMount, initialCursor, onReady }));
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (host.current === null) {
      return;
    }
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          autocapitalize: "off",
          autocorrect: "off",
          class: "mx-auto w-full max-w-2xl px-6 py-6 focus:outline-none",
          spellcheck: "false",
        },
      },
    });
    editor.mount(host.current);
    const chain = editor.chain();
    if (config.focusOnMount === true) {
      chain.focus();
    }
    chain
      .setTextSelection(
        Math.max(
          0,
          Math.min(config.initialCursor, editor.state.doc.textContent.length)
        ) + 1
      )
      .scrollIntoView()
      .run();
    config.onReady?.({
      find: createFindHandle(editor),
      focus: () => {
        editor.commands.focus();
      },
      getCursorOffset: () => Math.max(0, editor.state.selection.from - 1),
      insertText: (text) => {
        editor.chain().focus().insertContent(text).run();
      },
    });
    return () => {
      editor.unmount();
    };
  }, [config, editor]);

  return (
    <ScrollArea className="source-editor allow-select min-h-0 flex-1">
      <div className="min-h-full" ref={host} />
    </ScrollArea>
  );
}
