import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const FILLS_ITS_LINE = new Set(["embed", "image"]);

function caretBeside({ doc, selection }: EditorState) {
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return DecorationSet.empty;
  }

  const { $head } = selection;
  const { nodeAfter, nodeBefore, pos } = $head;

  if (nodeAfter !== null && FILLS_ITS_LINE.has(nodeAfter.type.name)) {
    return DecorationSet.create(doc, [
      Decoration.node(pos, pos + nodeAfter.nodeSize, {
        "data-caret": "before",
      }),
    ]);
  }

  if (nodeBefore !== null && FILLS_ITS_LINE.has(nodeBefore.type.name)) {
    return DecorationSet.create(doc, [
      Decoration.node(pos - nodeBefore.nodeSize, pos, {
        "data-caret": "after",
      }),
    ]);
  }

  return DecorationSet.empty;
}

/**
 * Marks the embed or image the caret sits beside, for the stylesheet to draw a
 * caret in the column's margin. An atom that fills its line leaves the native
 * caret only its own edge, where WebKit paints a bar along a note's border and
 * a tick in an image's corner.
 */
export const AtomCaret = Extension.create({
  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        props: {
          // An embed's read-only editor holds a selection but no caret.
          decorations: (state) =>
            editor.isEditable ? caretBeside(state) : DecorationSet.empty,
        },
      }),
    ];
  },

  name: "atomCaret",
});
