import type { MarkdownTokenizer } from "@tiptap/core";
import {
  ORDERED_LIST_MARKER_PATTERN,
  OrderedList,
  TaskList,
} from "@tiptap/extension-list";
import { Table } from "@tiptap/extension-table";
import { Lexer } from "marked";

const ORDERED_ITEM = new RegExp(
  `^\\s*(?:${ORDERED_LIST_MARKER_PATTERN})[.)]\\s`,
  "u"
);
const TASK_ITEM = /^\s*[-+*]\s+\[[ xX]\]\s+/u;
const ITEM = String.raw`[-+*]\s|(?:${ORDERED_LIST_MARKER_PATTERN})[.)]\s`;
// What ends an item's lazy continuation upstream: a heading, a fence, math,
// a rule, or a bullet that is not a task item.
const FENCE = "```|~~~";
const INTERRUPTS = String.raw`#{1,6}(?:\s|$)|${FENCE}|\$\$|(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n|$)|[-+*]\s+(?!\[[ xX]\]\s)`;
// Group 1 is a blank line whose next line is neither blank, indented nor an
// item; the other branch is an interrupter at the margin with no blank first.
const LIST_END = new RegExp(
  String.raw`\n(?:([ \t]*\n)(?=[\s\S])(?![ \t\n]|${ITEM})|(?=${INTERRUPTS}))`,
  "gu"
);

/**
 * The input up to where both upstream list parsers stop anyway. A cut at a
 * blank line keeps that line's own characters and drops the newline after it,
 * which leaves upstream's `raw` byte for byte what it was.
 */
function listWindow(src: string) {
  LIST_END.lastIndex = 0;
  const end = LIST_END.exec(src);

  if (end === null) {
    return src;
  }

  return src.slice(
    0,
    end[1] === undefined ? end.index : end.index + end[0].length - 1
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
function boundedList(node: typeof OrderedList | typeof TaskList, item: RegExp) {
  const parent = upstream(node);

  return node.extend({
    markdownTokenizer: {
      ...parent,
      tokenize: (src, tokens, lexer) =>
        item.test(src)
          ? parent.tokenize(listWindow(src), tokens, lexer)
          : undefined,
    },
  });
}

export const BoundedOrderedList = boundedList(OrderedList, ORDERED_ITEM);

export const BoundedTaskList = boundedList(TaskList, TASK_ITEM);

function tableAt(src: string) {
  TABLE_RULE.lastIndex = 0;

  return TABLE_RULE.exec(src)?.[0];
}

const table = upstream(Table);

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
});
