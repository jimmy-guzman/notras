import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { cn } from "cn";
import { useEffect, useState } from "react";
import type { WheelEvent } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";

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

/** Not under the pointer, where scrolling the list would take the wheel back from the note. */
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

/** The note's scroller is a sibling, so the wheel does not chain to it. */
function passUnusedWheelToNote(editor: Editor, event: WheelEvent<HTMLElement>) {
  const list = event.currentTarget.querySelector(
    '[data-slot="scroll-area-viewport"]'
  );

  if (list === null) {
    throw new Error("The outline has no scroll viewport");
  }

  const canScroll =
    event.deltaY < 0
      ? list.scrollTop > 0
      : list.scrollTop + list.clientHeight < list.scrollHeight - 1;

  if (!canScroll) {
    noteScroller(editor).scrollBy({ top: event.deltaY });
  }
}

/** A container query on the session panel shows it once the gutter fits it. */
export function NoteOutline({ editor }: { editor: Editor }) {
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

  if (headings.length < 2) {
    return null;
  }

  return (
    <nav
      aria-label="outline"
      className="pointer-events-none absolute inset-y-6 right-6 hidden w-[min(15rem,calc(50cqw-24rem))] flex-col @min-[68rem]:flex"
      onWheel={(event) => {
        passUnusedWheelToNote(editor, event);
      }}
    >
      <ScrollArea className="pointer-events-auto min-h-0">
        <ul className="ps-2">
          {headings.map((heading, index) => (
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
                }}
                ref={index === reading ? keepInView : undefined}
                title={heading.text}
                type="button"
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </nav>
  );
}
