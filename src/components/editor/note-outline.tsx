import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { cn } from "cn";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { goToHeading, outlineHeadings } from "./heading-navigation";
import type { OutlineHeading } from "./heading-navigation";

const INDENT = ["ps-0", "ps-3", "ps-6"];

function noteScroller(editor: Editor) {
  const scroller = editor.view.dom.closest(
    '[data-slot="scroll-area-viewport"]'
  );

  if (scroller === null) {
    throw new Error("The note has no scroll viewport");
  }

  return scroller;
}

/** At the note's end the last headings cannot reach the line, so the caret's section counts too. */
function readingIndex(
  editor: Editor,
  headings: OutlineHeading[],
  caret: number
) {
  const scroller = noteScroller(editor);
  // The line a jump lands on, measured as `goToHeading` does.
  const first = editor.view.nodeDOM(0);

  if (!(first instanceof Element)) {
    throw new TypeError("The note has no first block");
  }

  const inset =
    first.getBoundingClientRect().top -
    editor.view.dom.getBoundingClientRect().top;

  // A pixel of slack for the rounding a scroll position takes.
  const line = scroller.getBoundingClientRect().top + inset + 1;

  const passed = headings.findLastIndex((heading) => {
    const element = editor.view.nodeDOM(heading.position - 1);

    return (
      element instanceof Element && element.getBoundingClientRect().top <= line
    );
  });

  const atEnd =
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;

  return atEnd ? Math.max(passed, caret) : passed;
}

/** Not while the pointer is over the list, so a row never scrolls out from under it. */
function keepInView(row: HTMLElement | null) {
  if (row?.closest("nav")?.matches(":hover") !== true) {
    row?.scrollIntoView({ block: "nearest" });
  }
}

function useReadingIndex(
  editor: Editor,
  headings: OutlineHeading[],
  caret: number
) {
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    const scroller = noteScroller(editor);

    const read = () => {
      setIndex(readingIndex(editor, headings, caret));
    };

    // Images, embeds and alerts move headings without a scroll.
    const resize = new ResizeObserver(read);

    read();
    scroller.addEventListener("scroll", read, { passive: true });
    resize.observe(editor.view.dom);
    resize.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", read);
      resize.disconnect();
    };
  }, [caret, editor, headings]);

  return index;
}

interface NoteOutlineProps {
  editor: Editor;
  /** The note panel's outline tab, where the list draws. */
  host: HTMLElement;
  /** After a jump, so a graph covering the note can step aside. */
  onJump?: () => void;
}

/** The note's headings, drawn into the note panel. */
export function NoteOutline({ editor, host, onJump }: NoteOutlineProps) {
  const headings = useEditorState({
    editor,
    selector: ({ editor: instance }) => outlineHeadings(instance),
  });

  const head = useEditorState({
    editor,
    selector: ({ editor: instance }) => instance.state.selection.head,
  });

  const caret = headings.findLastIndex((heading) => heading.position <= head);
  const reading = useReadingIndex(editor, headings, caret);
  const top = Math.min(...headings.map((heading) => heading.level));

  const rows = headings.map((heading, index) => (
    <li
      className={cn(
        "relative",
        index === reading &&
          "before:bg-primary before:absolute before:inset-y-1.5 before:-left-2 before:w-0.5 before:rounded-full"
      )}
      key={heading.position}
    >
      <button
        aria-current={index === reading ? "location" : undefined}
        className={cn(
          "focus-visible:outline-ring block w-full truncate rounded-sm py-1 text-start text-sm transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2",
          INDENT[heading.level - top],
          index === reading
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => {
          goToHeading(editor.view, heading.position);
          onJump?.();
        }}
        ref={index === reading ? keepInView : undefined}
        title={heading.text}
        type="button"
      >
        {heading.text}
      </button>
    </li>
  ));

  return createPortal(
    <nav aria-label="outline">
      {headings.length === 0 ? (
        <p className="text-muted-foreground px-2 py-1 text-sm">
          no headings in this note
        </p>
      ) : (
        <ul className="ps-2">{rows}</ul>
      )}
    </nav>,
    host
  );
}
