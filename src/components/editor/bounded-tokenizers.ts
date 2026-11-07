import type {
  JSONContent,
  MarkdownRendererHelpers,
  MarkdownTokenizer,
} from "@tiptap/core";
import { renderTableToMarkdown, Table } from "@tiptap/extension-table";
import { Lexer } from "marked";

import { insertSentinel, SENTINEL } from "./sentinel";

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

function tableAt(src: string) {
  TABLE_RULE.lastIndex = 0;

  return TABLE_RULE.exec(src)?.[0];
}

const table = upstream(Table);

// Upstream's newline on each side reads back as an empty paragraph between
// two tables, one more per save.
const TABLE_PADDING = /^\n|\n$/gu;

function renderTable(node: JSONContent, helpers: MarkdownRendererHelpers) {
  return renderTableToMarkdown(node, helpers).replaceAll(TABLE_PADDING, "");
}

/**
 * The table as it reads without the sentinel, with the sentinel put back at its
 * row and column. Left in a cell it widens the column, which moves every row
 * below it and leaves the block unable to keep the text the file wrote.
 */
function renderSentinelTable(
  node: JSONContent,
  helpers: MarkdownRendererHelpers,
  marked: string
) {
  const offset = marked.indexOf(SENTINEL);
  const row = marked.slice(0, offset).split("\n").length - 1;
  const column = offset - (marked.lastIndexOf("\n", offset) + 1);

  const plain = renderTable(node, {
    ...helpers,
    renderChildren: (...args) =>
      helpers.renderChildren(...args).replaceAll(SENTINEL, ""),
  });

  const rowStart = plain
    .split("\n")
    .slice(0, row)
    .reduce((total, line) => total + line.length + 1, 0);

  return insertSentinel(plain, rowStart + column);
}

/**
 * Through 3.33.0 upstream splits the whole remaining input at every block.
 *
 * TODO: drop the tokenizer override once `@tiptap/extension-table` bounds its
 * own scan.
 */
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
  renderMarkdown: (node, helpers) => {
    const marked = renderTable(node, helpers);

    return marked.split(SENTINEL).length === 2
      ? renderSentinelTable(node, helpers, marked)
      : marked;
  },
});
