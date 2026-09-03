import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";

import { moveRangeByStep } from "./move-selection";

function step(editor: Editor, back: boolean) {
  const tr = moveRangeByStep(editor.state, back);

  if (tr === null) {
    return false;
  }

  editor.view.dispatch(tr);

  return true;
}

/**
 * `⌥↑` and `⌥↓` move whatever the selection covers. The binding is VS Code's
 * move-line-up/down, so it costs macOS's paragraph jump inside the editor and
 * buys the chord people already reach for. A TipTap shortcut rather than an app
 * hotkey, because several sessions are alive at once and only the focused
 * editor may answer.
 */
export const MoveSelectionKeys = Extension.create({
  addKeyboardShortcuts() {
    return {
      "Alt-ArrowDown": ({ editor }) => step(editor, false),
      "Alt-ArrowUp": ({ editor }) => step(editor, true),
    };
  },

  name: "moveSelectionKeys",
});
