import type { MarkdownTokenizer } from "@tiptap/core";
import { renderTableToMarkdown, Table } from "@tiptap/extension-table";
import { Lexer } from "marked";

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

/**
 * Through 3.31.4 upstream splits the whole remaining input at every block.
 *
 * TODO: drop the wrapper once `@tiptap/extension-table` bounds its own scan.
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
  renderMarkdown: (node, helpers) =>
    renderTableToMarkdown(node, helpers).replace(TABLE_PADDING, ""),
});
