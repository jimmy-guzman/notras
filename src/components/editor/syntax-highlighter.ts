import { codeToTokens, isSupportedLanguage } from "@pierre/highlights";
import type { Lang } from "@pierre/highlights";

import { parseNote } from "@/core/frontmatter";

import { syntaxTheme } from "./syntax-theme";

/** One colored run of code; `offset` counts from the start of the code. */
export interface SyntaxToken {
  color: string;
  length: number;
  offset: number;
}

const PLAIN = new Set(["plain", "plaintext", "text", "txt"]);
const MARKDOWN = new Set(["markdown", "md", "mdc"]);

/** Fence labels that name a lexer the highlighter knows under another name. */
const ALIASES = new Map([
  ["console", "shellsession"],
  ["f18", "fortran-free-form"],
  ["mbti", "moonbit"],
]);

/** The runs that are not in the text color, which needs no decoration. */
function coloredTokens(code: string, lang: Lang, shift: number) {
  const { fg, tokens } = codeToTokens(code, { lang, theme: syntaxTheme });

  return tokens
    .flat()
    .flatMap(({ color, content, offset }) =>
      color === undefined || color === fg
        ? []
        : [{ color, length: content.length, offset: offset + shift }]
    );
}

/** Resolve an explicit fence label without changing what is saved to the file. */
export function syntaxLanguage(
  language: string | null | undefined
): Lang | undefined {
  const lowered = language?.toLowerCase();

  const label =
    lowered === undefined ? undefined : (ALIASES.get(lowered) ?? lowered);

  return label === undefined || PLAIN.has(label) || !isSupportedLanguage(label)
    ? undefined
    : label;
}

/**
 * Tokenize code with the packaged lexers, so no network service receives it.
 * A note's frontmatter ends where `parseNote` says it does: the Markdown lexer
 * closes a block on `---` alone and would read the body after `...` as YAML.
 */
export function highlightCode(code: string, language: Lang): SyntaxToken[] {
  if (!MARKDOWN.has(language)) {
    return coloredTokens(code, language, 0);
  }

  const { body, raw } = parseNote(code);

  if (raw === undefined) {
    return coloredTokens(code, language, 0);
  }

  const head = code.slice(0, code.length - body.length);

  return [
    ...coloredTokens(head, "yaml", 0),
    ...coloredTokens(body, language, head.length),
  ];
}
