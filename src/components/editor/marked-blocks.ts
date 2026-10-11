import type { TokenizerExtension, TokenizerObject } from "marked";
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

/**
 * WebKit ran these five checks over the whole remaining input on every block,
 * which was most of the cost of opening a long plain note.
 *
 * TODO: drop the gate once Marked matches its anchored block rules without
 * scanning past position zero in WebKit. Through 17.0.6 it does not.
 */
const blockGates: TokenizerObject = {
  blockquote: gate(block.blockquote),
  hr: gate(block.hr),
  html: gate(block.html),
  lheading: gate(block.lheading),
  table: gate(block.table),
};

/**
 * Keeps every link definition as a token, a repeat of a label included,
 * which marked records and then drops. The first one still resolves the
 * label. A definition cannot interrupt a paragraph, which the built-in
 * tokenizer handles by folding it into the paragraph's text.
 */
const definitions: TokenizerExtension = {
  level: "block",
  name: "def",
  tokenizer(src, tokens) {
    // The lexer keeps its tokenizer private and hands it out on its options.
    const { tokenizer } = this.lexer.options;

    if (!tokenizer) {
      throw new Error("The lexer has no tokenizer");
    }

    const last = tokens.at(-1);
    const token =
      last?.type === "paragraph" || last?.type === "text"
        ? undefined
        : tokenizer.def(src);

    if (token !== undefined) {
      this.lexer.tokens.links[token.tag] ??= {
        href: token.href,
        title: token.title,
      };
    }

    return token;
  },
};

export function createNoteMarked() {
  return new Marked({ gfm: true }).use({
    extensions: [definitions],
    tokenizer: blockGates,
  });
}
