import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { cn } from "cn";
import type { Token, Tokens } from "marked";
import { useDeferredValue, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { parseNote } from "@/core/frontmatter";
import { bodyTitle } from "@/core/notes";

import { DEEPEST_LEVEL } from "./heading-navigation";
import { createNoteMarked } from "./marked-blocks";

interface SourceHeading {
  level: number;
  /** The source line the heading starts on. */
  line: number;
  /** The heading line's start as a character offset into the source. */
  offset: number;
  text: string;
}

const INDENT = ["ps-0", "ps-3", "ps-6"];

/** Every break marked reads as one, a lone CR from an older Mac file included. */
const LINE_BREAK = /\r\n?|\n/gu;

const marked = createNoteMarked();

function lineBreaks(text: string) {
  return text.match(LINE_BREAK)?.length ?? 0;
}

function isHeading(token: Token): token is Tokens.Heading {
  return token.type === "heading";
}

function isList(token: Token): token is Tokens.List {
  return token.type === "list";
}

/** The h1 to h3 headings and the line each starts on, inside quotes and list items too, as the note view finds them. */
function headingLines(tokens: Token[], firstLine: number) {
  const found: { level: number; line: number; text: string }[] = [];
  let line = firstLine;

  for (const token of tokens) {
    if (isHeading(token)) {
      const text = token.text.trim();

      if (token.depth <= DEEPEST_LEVEL && text !== "") {
        found.push({ level: token.depth, line, text });
      }
    } else if (isList(token)) {
      found.push(...headingLines(token.items, line));
    } else if (token.type === "blockquote" || token.type === "list_item") {
      found.push(...headingLines(token.tokens ?? [], line));
    }

    line += lineBreaks(token.raw);
  }

  return found;
}

/** Where each line of `source` starts, as a UTF-16 offset like the editor's positions. */
function lineOffsets(source: string) {
  return [
    0,
    ...Array.from(
      source.matchAll(LINE_BREAK),
      (found) => found.index + found[0].length
    ),
  ];
}

/** The body's h1 to h3 headings, less the h1 the tab shows as the title. */
function sourceHeadings(source: string): SourceHeading[] {
  const { body } = parseNote(source);
  const start = lineBreaks(source) - lineBreaks(body);
  const offsets = lineOffsets(source);
  const title = bodyTitle(body);
  const titleLine = title?.depth === 1 ? start + title.line : -1;

  return headingLines(marked.lexer(body), start).flatMap((heading) => {
    if (heading.level === 1 && heading.line === titleLine) {
      return [];
    }

    const offset = offsets[heading.line];

    if (offset === undefined) {
      throw new RangeError(`The source has no line ${heading.line}`);
    }

    return [{ ...heading, offset }];
  });
}

function sourceScroller(editor: Editor) {
  const scroller = editor.view.dom.closest(
    '[data-slot="scroll-area-viewport"]'
  );

  if (scroller === null) {
    throw new Error("The source has no scroll viewport");
  }

  return scroller;
}

/** The caret goes to the heading's start, and the heading to the top of the view. */
function goToSourceHeading(editor: Editor, offset: number) {
  const { view } = editor;
  const position = offset + 1;

  view.focus();
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, position))
  );

  const scroller = sourceScroller(editor);

  // The source's own top padding, so the heading lands where the first line sits.
  const inset = view.coordsAtPos(1).top - view.dom.getBoundingClientRect().top;

  // Set after the focus, since WebKit reveals the selection on focus.
  scroller.scrollTop +=
    view.coordsAtPos(position).top -
    scroller.getBoundingClientRect().top -
    inset;
}

/** The last heading at or above the line a jump lands on; at the end, the caret's section if later. */
function sourceReadingIndex(
  editor: Editor,
  headings: SourceHeading[],
  caret: number
) {
  const { view } = editor;
  const scroller = sourceScroller(editor);
  const inset = view.coordsAtPos(1).top - view.dom.getBoundingClientRect().top;
  // A pixel of slack for the rounding a scroll position takes.
  const line = scroller.getBoundingClientRect().top + inset + 1;

  const passed = headings.findLastIndex(
    (heading) => view.coordsAtPos(heading.offset + 1).top <= line
  );

  const atEnd =
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;

  return atEnd ? Math.max(passed, caret) : passed;
}

function useSourceReadingIndex(
  editor: Editor,
  headings: SourceHeading[],
  caret: number,
  current: boolean
) {
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    const scroller = sourceScroller(editor);

    const read = () => {
      if (current) {
        setIndex(sourceReadingIndex(editor, headings, caret));
      }
    };

    // Wrapping moves headings without a scroll when the pane resizes.
    const resize = new ResizeObserver(read);

    read();
    scroller.addEventListener("scroll", read, { passive: true });
    resize.observe(editor.view.dom);
    resize.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", read);
      resize.disconnect();
    };
  }, [caret, current, editor, headings]);

  return index;
}

/** Not while the pointer is over the list, so a row never scrolls out from under it. */
function keepInView(row: HTMLElement | null) {
  if (row?.closest("nav")?.matches(":hover") !== true) {
    row?.scrollIntoView({ block: "nearest" });
  }
}

interface SourceOutlineProps {
  editor: Editor;
  host: HTMLElement;
  /** After a jump, so a covering view can step aside. */
  onJump?: () => void;
}

/** The markdown source's headings, drawn into the note panel. */
export function SourceOutline({ editor, host, onJump }: SourceOutlineProps) {
  // The text, not the headings, so a caret move never lexes the note.
  const source = useEditorState({
    editor,
    selector: ({ editor: instance }) => instance.state.doc.textContent,
  });

  // Lexing a 450 KB note takes about 34ms, so a keystroke commits first and
  // the headings follow in a render React can interrupt.
  const settled = useDeferredValue(source);
  const headings = sourceHeadings(settled);
  // Offsets into `settled`, which can trail the editor by a render and point
  // past the end of a shortened note, so nothing reads positions until then.
  const current = settled === source;

  const head = useEditorState({
    editor,
    selector: ({ editor: instance }) => instance.state.selection.head,
  });

  const caret = headings.findLastIndex((heading) => heading.offset + 1 <= head);
  const reading = useSourceReadingIndex(editor, headings, caret, current);

  const top = Math.min(...headings.map((heading) => heading.level));

  return createPortal(
    <nav aria-label="outline">
      {headings.length === 0 ? (
        <p className="text-muted-foreground px-2 py-1 text-sm">
          no headings in this note
        </p>
      ) : (
        <ul className="ps-2">
          {headings.map((heading, index) => (
            <li
              className={cn(
                "relative",
                index === reading &&
                  "before:bg-primary before:absolute before:inset-y-1.5 before:-left-2 before:w-0.5 before:rounded-full"
              )}
              key={heading.offset}
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
                  if (!current) {
                    return;
                  }

                  goToSourceHeading(editor, heading.offset);
                  onJump?.();
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
      )}
    </nav>,
    host
  );
}
