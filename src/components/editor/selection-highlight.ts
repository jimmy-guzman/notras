import { Extension } from "@tiptap/core";
import { AllSelection, Plugin, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Paints a text selection as a decoration on the selected text, line by line.
 * WebKit's own paint fills the rest of each line and the space between blocks
 * as well, stops that fill at every flex item, positioned box and scroller,
 * and cuts a hole wherever an absolute box sits, so a task row or a fence
 * striped under ⌘A. The stylesheet makes the native paint transparent inside
 * the editor. Node and cell selections keep their own styles.
 */
export const SelectionHighlight = Extension.create({
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: ({ doc, selection }) =>
            !selection.empty &&
            (selection instanceof TextSelection ||
              selection instanceof AllSelection)
              ? DecorationSet.create(doc, [
                  Decoration.inline(selection.from, selection.to, {
                    class: "selected-text",
                  }),
                ])
              : null,
        },
      }),
    ];
  },
  name: "selectionHighlight",
});
