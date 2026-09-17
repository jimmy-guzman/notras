import type { Editor } from "@tiptap/core";
import { useLayoutEffect, useRef, useState } from "react";

import { createFindHandle } from "@/components/editor/find";
import type { FindHandle } from "@/components/editor/find";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface SourceEditorHandle {
  find: FindHandle;
  /** Takes the caret without moving the viewport. */
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
  // oxlint-disable-next-line react/hook-use-state -- a once-built instance has no setter
  const [config] = useState(() => ({ focusOnMount, initialCursor, onReady }));
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = host.current;
    const mount = (target: HTMLDivElement) => {
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
      editor.mount(target);
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
          const scroller = target.closest<HTMLElement>(
            '[data-slot="scroll-area-viewport"]'
          );
          const top = scroller?.scrollTop;

          editor.view.focus();

          // WebKit reveals the selection when the editable it focuses already
          // holds it, ignoring `preventScroll`, so the offset is put back.
          if (scroller !== null && top !== undefined) {
            scroller.scrollTop = top;
          }
        },
        getCursorOffset: () => Math.max(0, editor.state.selection.from - 1),
        insertText: (text) => {
          editor.chain().focus().insertContent(text).run();
        },
      });
      return () => {
        editor.unmount();
      };
    };
    return element === null ? undefined : mount(element);
  }, [config, editor]);

  return (
    <ScrollArea className="min-h-0 flex-1 select-text" data-source-editor>
      <div className="min-h-full" ref={host} />
    </ScrollArea>
  );
}
