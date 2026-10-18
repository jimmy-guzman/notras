import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useRef } from "react";

import { ScrollBar } from "@/components/ui/scroll-area";

/**
 * A table scrolls sideways behind the scrollbar the editor draws rather than
 * the webview's own. The renderer registers this with `tbody` as the content
 * element, so the rows land inside the table here.
 */
export function TableNodeView({ editor }: ReactNodeViewProps) {
  const viewport = useRef<HTMLDivElement>(null);

  // Base UI shows the bar for a scroll only after a wheel, pointer or key
  // event on the viewport itself. A keystroke targets the editing host above
  // it, so the caret moving into a hidden column would slide the table with
  // no bar. Any key can carry the caret in, an arrow from the block after the
  // table included, and the browser moves that one after the keydown, so the
  // mark does not wait on the selection. A wheel event with no delta is the
  // one event the viewport reads as the person's and ProseMirror does not
  // handle.
  useEffect(() => {
    const host = editor.view.dom;

    const markUserScroll = () => {
      viewport.current?.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true })
      );
    };

    host.addEventListener("keydown", markUserScroll);

    return () => {
      host.removeEventListener("keydown", markUserScroll);
    };
  }, [editor]);

  return (
    <NodeViewWrapper className="table-box">
      <ScrollAreaPrimitive.Root>
        {/* Base UI puts a viewport that overflows in the tab order, which would
            make a wide table a tab stop between the bars and the note. */}
        <ScrollAreaPrimitive.Viewport
          className="table-viewport"
          ref={viewport}
          tabIndex={-1}
        >
          <NodeViewContent<"table"> as="table" />
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar orientation="horizontal" />
      </ScrollAreaPrimitive.Root>
    </NodeViewWrapper>
  );
}
