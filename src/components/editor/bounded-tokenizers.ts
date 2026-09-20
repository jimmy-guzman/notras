import type { MarkdownTokenizer } from "@tiptap/core";
import {
  ORDERED_LIST_MARKER_PATTERN,
  OrderedList,
  TaskList,
} from "@tiptap/extension-list";
import { renderTableToMarkdown, Table } from "@tiptap/extension-table";
import { Lexer } from "marked";

const ORDERED_MARK = String.raw`(?:${ORDERED_LIST_MARKER_PATTERN})[.)]\s`;
const TASK_MARK = String.raw`[-+*]\s+\[[ xX]\]\s`;
const ORDERED_ITEM = new RegExp(String.raw`^\s*${ORDERED_MARK}`, "u");
const TASK_ITEM = new RegExp(String.raw`^\s*${TASK_MARK}`, "u");
const FENCE = "```|~~~";
// What ends an ordered item's lazy continuation upstream: a heading, a
// fence, math, a rule, or any bullet.
const INTERRUPTS_ORDERED = String.raw`#{1,6}(?:\s|$)|${FENCE}|\$\$|(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n|$)|[-+*]\s`;
// A task list has no lazy continuation: any line at the margin that is not
// a task item ends it.
const INTERRUPTS_TASK = String.raw`(?!${TASK_MARK})\S`;

/**
 * Where both upstream list parsers stop. Group 1 is a blank line whose next
 * line is neither blank, indented nor this list's own kind of item; the other
 * branch is an interrupter at the margin with no blank line first.
 */
function listEnd(mark: string, interrupts: string) {
  return new RegExp(
    String.raw`\n(?:([ \t]*\n)(?=[\s\S])(?![ \t\n]|${mark})|(?=${interrupts}))`,
    "gu"
  );
}

/**
 * The input up to where upstream stops anyway. A cut at a blank line keeps
 * that line's own characters and drops the newline after it, which leaves
 * upstream's `raw` byte for byte what it was.
 */
function listWindow(src: string, end: RegExp) {
  end.lastIndex = 0;
  const found = end.exec(src);

  if (found === null) {
    return src;
  }

  return src.slice(
    0,
    found[1] === undefined ? found.index : found.index + found[0].length - 1
  );
}

// marked's own table rule, sticky: it stops at the first line that is not a
// row, where upstream searches on to the next blank line.
const TABLE_RULE = new RegExp(
  Lexer.rules.block.gfm.table.source,
  `${Lexer.rules.block.gfm.table.flags}y`
);

function upstream(node: { config: { markdownTokenizer?: MarkdownTokenizer } }) {
  const tokenizer = node.config.markdownTokenizer;

  if (tokenizer === undefined) {
    throw new Error("no markdown tokenizer");
  }

  return tokenizer;
}

/**
 * Through 3.31.3 these three split the whole remaining input at every block.
 *
 * TODO: drop the wrappers once `@tiptap/extension-list` and
 * `@tiptap/extension-table` bound their own scans.
 */
function boundedList(
  node: typeof OrderedList | typeof TaskList,
  item: RegExp,
  end: RegExp
) {
  const parent = upstream(node);

  return node.extend({
    markdownTokenizer: {
      ...parent,
      tokenize: (src, tokens, lexer) =>
        item.test(src)
          ? parent.tokenize(listWindow(src, end), tokens, lexer)
          : undefined,
    },
  });
}

export const BoundedOrderedList = boundedList(
  OrderedList,
  ORDERED_ITEM,
  listEnd(ORDERED_MARK, INTERRUPTS_ORDERED)
);

export const BoundedTaskList = boundedList(
  TaskList,
  TASK_ITEM,
  listEnd(TASK_MARK, INTERRUPTS_TASK)
);

function tableAt(src: string) {
  TABLE_RULE.lastIndex = 0;

  return TABLE_RULE.exec(src)?.[0];
}

const table = upstream(Table);
// Upstream's newline on each side reads back as an empty paragraph between
// two tables, one more per save.
const TABLE_PADDING = /^\n|\n$/gu;

export const BoundedTable = Table.extend({
  markdownTokenizer: {
    ...table,
    start: (src: string) => (tableAt(src) === undefined ? -1 : 0),
    tokenize: (src, tokens, lexer) => {
      const found = tableAt(src);

      return found === undefined
        ? undefined
        : table.tokenize(found, tokens, lexer);
    },
  },
  renderMarkdown: (node, helpers) =>
    renderTableToMarkdown(node, helpers).replace(TABLE_PADDING, ""),
});
