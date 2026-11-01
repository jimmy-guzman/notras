import type { Editor } from "@tiptap/core";
import { Extension, findChildren } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { bodyTitle } from "@/core/notes";

import { hasNumber } from "./attrs";
import { converterOf, fileMarkdown } from "./extensions";
import { headingText } from "./heading-anchors";

export interface OutlineHeading {
  level: number;
  /** The caret position at the heading's start. */
  position: number;
  text: string;
}

export const DEEPEST_LEVEL = 3;

function headingLevel(heading: Node) {
  if (!hasNumber(heading.attrs, "level")) {
    throw new TypeError("A heading has no level");
  }

  return heading.attrs.level;
}

function isH1(node: Node) {
  return node.type.name === "heading" && headingLevel(node) === 1;
}

/** With the note's link definitions, so a reference link resolves. */
function titleOf(editor: Editor, blocks: Node[]) {
  const definitions = editor.state.doc.children.filter(
    (node) => node.type.name === "linkDefinition"
  );

  return bodyTitle(
    fileMarkdown(
      converterOf(editor),
      editor.schema.topNodeType.create(null, [...blocks, ...definitions])
    )
  );
}

/** Reads only up to the first h1, so a caret move or a keystroke never serializes the note. */
function h1Title(editor: Editor) {
  const blocks = editor.state.doc.children;

  const end = blocks.findIndex(
    (block) => isH1(block) || findChildren(block, isH1).length > 0
  );

  if (end === -1) {
    return null;
  }

  const source = titleOf(editor, blocks.slice(0, end + 1));

  return source?.depth === 1 ? source.title : null;
}

/** The h1 to h3 headings, less the h1 the tab shows as the title. */
export function outlineHeadings(editor: Editor): OutlineHeading[] {
  const found: { heading: OutlineHeading; node: Node }[] = [];

  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "heading") {
      return true;
    }

    const level = headingLevel(node);
    const text = headingText(node).trim();

    if (level <= DEEPEST_LEVEL && text !== "") {
      found.push({ heading: { level, position: position + 1, text }, node });
    }

    return false;
  });

  const title = h1Title(editor);

  const titleIndex =
    title === null
      ? -1
      : found.findIndex(
          ({ heading, node }) =>
            heading.level === 1 && titleOf(editor, [node])?.title === title
        );

  return found.flatMap(({ heading }, index) =>
    index === titleIndex ? [] : [heading]
  );
}

/** Scrolls the heading to where the first block sits at the top. */
export function goToHeading(view: EditorView, position: number) {
  view.focus();
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, position))
  );

  const scroller = view.dom.closest('[data-slot="scroll-area-viewport"]');
  const heading = view.nodeDOM(position - 1);
  // Not firstElementChild: a hidden gap cursor can be that, with an empty rect.
  const first = view.nodeDOM(0);

  if (scroller === null) {
    throw new Error("The note has no scroll viewport");
  }

  if (!(heading instanceof Element) || !(first instanceof Element)) {
    return;
  }

  const inset =
    first.getBoundingClientRect().top - view.dom.getBoundingClientRect().top;

  // Set after the focus, since WebKit reveals the selection on focus.
  scroller.scrollTop +=
    heading.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    inset;
}

function goToAdjacentHeading(editor: Editor, back: boolean) {
  const { head } = editor.state.selection;
  const headings = outlineHeadings(editor);

  const target = back
    ? headings.findLast((heading) => heading.position < head)
    : headings.find((heading) => heading.position > head);

  if (target === undefined) {
    return false;
  }

  goToHeading(editor.view, target.position);

  return true;
}

/** A TipTap shortcut, so only the focused editor answers. */
export const HeadingKeys = Extension.create({
  addKeyboardShortcuts() {
    return {
      "Ctrl-Mod-ArrowDown": ({ editor }) => goToAdjacentHeading(editor, false),
      "Ctrl-Mod-ArrowUp": ({ editor }) => goToAdjacentHeading(editor, true),
    };
  },

  name: "headingKeys",
});
