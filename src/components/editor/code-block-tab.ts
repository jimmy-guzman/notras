import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

const INDENT = "  ";

/**
 * The offsets in a code block's text where the lines a selection touches
 * start. A selection ending at the start of a line leaves that line out.
 */
function lineStarts(text: string, from: number, to: number) {
  const first = from === 0 ? 0 : text.lastIndexOf("\n", from - 1) + 1;
  const breaks = text.slice(first, Math.max(first, to - 1)).matchAll(/\n/gu);

  return [first, ...[...breaks].map((found) => first + found.index + 1)];
}

/**
 * Tab and Shift-Tab inside one code block: a caret takes two spaces, and a
 * selection indents or outdents every line it touches by up to two. False
 * when the selection leaves the block.
 */
function indentCode(editor: Editor, outdent: boolean) {
  const { $from, $to, empty } = editor.state.selection;

  if ($from.parent.type.name !== "codeBlock" || !$from.sameParent($to)) {
    return false;
  }

  if (empty && !outdent) {
    return editor.commands.insertContent(INDENT);
  }

  const text = $from.parent.textContent;
  const start = $from.start();
  const { tr } = editor.state;

  for (const line of lineStarts(text, $from.parentOffset, $to.parentOffset)) {
    const at = tr.mapping.map(start + line);

    if (outdent) {
      const spaces = /^ {0,2}/u.exec(text.slice(line))?.[0].length ?? 0;
      tr.delete(at, at + spaces);
    } else {
      tr.insertText(INDENT, at);
    }
  }

  editor.view.dispatch(tr);

  return true;
}

/**
 * Keyed ahead of every other extension, since a code block sits inside list
 * and task items whose own Tab would nest the item instead.
 */
export const CodeBlockTab = Extension.create({
  addKeyboardShortcuts() {
    return {
      "Shift-Tab": () => indentCode(this.editor, true),
      Tab: () => indentCode(this.editor, false),
    };
  },
  name: "codeBlockTab",
  priority: 1000,
});
