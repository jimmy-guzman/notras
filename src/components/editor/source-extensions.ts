import { Extension } from "@tiptap/core";
import type { Extensions } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import type { Plugin, Transaction } from "@tiptap/pm/state";
import type { Token, Tokens } from "marked";

import { CodeBlockShiki } from "@/components/editor/code-block-shiki";
import { Find } from "@/components/editor/find";
import { SelectionHighlight } from "@/components/editor/selection-highlight";
import { parseNote } from "@/core/frontmatter";
import { titleSource } from "@/core/notes";

import { createNoteMarked } from "./marked-blocks";
import { SENTINEL } from "./sentinel";

const INDENT = "  ";

const marked = createNoteMarked();

interface OpenItem {
  /** The column the item's children and wrapped lines start at. */
  nest: number;
  /** The column its marker starts at. */
  indent: number;
}

function isList(token: Token): token is Tokens.List {
  return token.type === "list";
}

function lastBlock(tokens: readonly Token[]) {
  return tokens.findLast((token) => token.type !== "space");
}

/** The column `prefix` ends at from `column`, with a tab stop every four. */
function columnAfter(prefix: string, column: number) {
  let at = column;

  for (const char of prefix) {
    at = char === "\t" ? at + 4 - (at % 4) : at + 1;
  }

  return at;
}

/**
 * The column an item's children start at, for an item whose raw text starts
 * at `offset`. An empty item's children start one column past its marker, and
 * a task's sit under the marker's text rather than after its checkbox.
 */
function nestColumn(item: Tokens.ListItem, offset: number) {
  const [raw = ""] = item.raw.split("\n");
  const [text = ""] = item.text.split("\n");
  const [first] = item.tokens;
  const checkbox = first?.type === "checkbox" ? first.raw.length : 0;

  return text === ""
    ? columnAfter(raw.trimEnd(), offset) + 1
    : columnAfter(raw.slice(0, raw.length - text.length - checkbox), offset);
}

/**
 * The list items a line after `tokens` can still nest in, outermost first.
 * A nested item's raw text starts at its parent's children column.
 */
function openItems(tokens: readonly Token[], offset: number): OpenItem[] {
  const last = lastBlock(tokens);
  const item =
    last !== undefined && isList(last) ? last.items.at(-1) : undefined;

  if (item === undefined) {
    return [];
  }

  const nest = nestColumn(item, offset);

  return [
    {
      indent: columnAfter(
        item.raw.slice(0, item.raw.length - item.raw.trimStart().length),
        offset
      ),
      nest,
    },
    ...openItems(item.tokens, nest),
  ];
}

function endsInCode(tokens: readonly Token[]): boolean {
  const last = lastBlock(tokens);
  const item =
    last !== undefined && isList(last) ? last.items.at(-1) : undefined;

  return (
    last?.type === "code" || (item !== undefined && endsInCode(item.tokens))
  );
}

/**
 * The list items a line indented `indent` spaces at offset `start` in `text`
 * can nest in, or none when the line falls in frontmatter or code. A blank
 * line after an item still leaves it open to a line indented to its children.
 */
function nestingAt(text: string, start: number, indent: number) {
  const { raw } = parseNote(text);
  // YAML nests by its own rules, so neither the block, through its closing
  // delimiter, nor anything in it is read as markdown.
  const body = raw === undefined ? 0 : raw.lines.length + 2;
  const lines = text.slice(0, start).split("\n");

  if (lines.length <= body) {
    return [];
  }

  const above = lines.slice(body, -1).join("\n");

  return endsInCode(marked.lexer(`${above}\n${" ".repeat(indent)}${SENTINEL}`))
    ? []
    : openItems(marked.lexer(above), 0);
}

/** ProseMirror swallows every Enter keydown, so an unbound Shift+Enter is dead. */
const SourceKeys = Extension.create({
  addKeyboardShortcuts() {
    // The whole file is one code block, so parentOffset is an offset into the
    // entire document -- the current line starts after the last newline
    // before the caret, not at the start of the parent.
    const caretLine = () => {
      const { $from } = this.editor.state.selection;
      const offset = $from.parentOffset;
      const text = $from.parent.textContent;
      const start = offset === 0 ? 0 : text.lastIndexOf("\n", offset - 1) + 1;

      return {
        before: text.slice(start, offset),
        indent: /^ */u.exec(text.slice(start))?.[0].length ?? 0,
        line: start,
        start: $from.start() + start,
        text,
      };
    };

    return {
      "Shift-Enter": () => this.editor.commands.newlineInCode(),
      "Shift-Tab": () => {
        const { indent, line, start, text } = caretLine();
        const parent = nestingAt(text, line, indent).find(
          (item) => item.nest === indent
        );
        const width =
          parent === undefined ? INDENT.length : indent - parent.indent;

        // With nothing to outdent the key stays in the note, as in rich mode.
        if (indent < width) {
          return true;
        }

        return this.editor
          .chain()
          .deleteRange({ from: start, to: start + width })
          .run();
      },
      Tab: () => {
        const { before, indent, line, text } = caretLine();
        const item = /^ *$/u.test(before)
          ? nestingAt(text, line, indent).find((open) => open.nest > indent)
          : undefined;
        const width = item === undefined ? INDENT.length : item.nest - indent;

        return this.editor.commands.insertContent(" ".repeat(width));
      },
    };
  },
  name: "sourceKeys",
});

export function touchesSourceTitle(transaction: Transaction) {
  const before = transaction.before.textContent;
  const after = transaction.doc.textContent;
  const old = titleSource(before);
  const next = titleSource(after);
  if (
    (old?.title !== next?.title ||
      before.slice(old?.from, old?.to) !== after.slice(next?.from, next?.to)) &&
    (old !== undefined || next !== undefined)
  ) {
    return true;
  }
  return transaction.steps.some((step, index) => {
    const doc = transaction.docs[index];
    const range = doc === undefined ? undefined : titleSource(doc.textContent);
    if (range === undefined) {
      return false;
    }
    let touched = false;
    // oxlint-disable-next-line unicorn/no-array-for-each -- a ProseMirror step map, not an array
    step.getMap().forEach((from, to) => {
      touched ||= from - 1 <= range.to && to - 1 >= range.from;
    });
    return touched;
  });
}

/** Source editing uses the session document's schema and history. */
export function createSourceExtensions(historyPlugin: Plugin): Extensions {
  return [
    Document.extend({
      addAttributes: () => ({ name: { default: 0, rendered: false } }),
      content: "codeBlock",
    }),
    Find,
    Text,
    CodeBlockShiki.configure({
      defaultLanguage: "markdown",
      exitOnArrowDown: false,
      exitOnTripleEnter: false,
    }),
    UndoRedo.extend({ addProseMirrorPlugins: () => [historyPlugin] }),
    SelectionHighlight,
    SourceKeys,
  ];
}
