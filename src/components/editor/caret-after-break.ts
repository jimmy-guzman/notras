import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

/**
 * WebKit keeps painting the caret where it was when the DOM selection is
 * collapsed to just after a `<br>`, so a Shift+Enter looks like nothing
 * happened until the next key (ProseMirror #1092). ProseMirror's own fix was
 * to rebuild the range instead of collapsing to it, and prosemirror-view
 * 1.41.0 dropped that on Safari for a shadow DOM fix, so the rebuild is here.
 */
export const CaretAfterBreak = Extension.create({
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: () => ({
          update: (view) => {
            const selection = document.getSelection();
            const node = selection?.anchorNode ?? null;

            if (
              view.composing ||
              selection === null ||
              !selection.isCollapsed ||
              node === null ||
              !view.dom.contains(node) ||
              node.childNodes[selection.anchorOffset - 1]?.nodeName !== "BR"
            ) {
              return;
            }

            const range = selection.getRangeAt(0);

            selection.removeAllRanges();
            selection.addRange(range);
          },
        }),
      }),
    ];
  },

  name: "caretAfterBreak",
});
