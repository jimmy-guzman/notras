import type { TokenizerObject } from "marked";
import { Lexer, Marked } from "marked";

// Every block rule is anchored with `^` and none is multiline, so a sticky
// copy at index zero answers the same question. marked reads `false` as
// "fall through to the built-in tokenizer".
function gate(rule: RegExp) {
  const sticky = new RegExp(rule.source, `${rule.flags}y`);
  return (src: string) => {
    sticky.lastIndex = 0;
    return sticky.test(src) ? false : undefined;
  };
}

const block = Lexer.rules.block.gfm;

// WebKit ran these five checks over the whole remaining input on every block,
// which was most of the cost of opening a long plain note.
const blockGates: TokenizerObject = {
  blockquote: gate(block.blockquote),
  hr: gate(block.hr),
  html: gate(block.html),
  lheading: gate(block.lheading),
  table: gate(block.table),
};

export function createNoteMarked() {
  return new Marked({ gfm: true }).use({ tokenizer: blockGates });
}
