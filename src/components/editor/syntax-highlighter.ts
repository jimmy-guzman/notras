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
const DIFF = new Set(["diff", "patch"]);

/**
 * The ink each diff line takes as a whole, by its prefix. The lexer greys the
 * `+` and `-` markers and colors the file lines as change, which no theme
 * category can tell apart from the lines they name.
 */
const DIFF_INKS = [
  [/^@@/u, "var(--syntax-member)"],
  [/^-/u, "var(--syntax-removed)"],
  [/^\+/u, "var(--syntax-added)"],
  [/^!/u, "var(--syntax-changed)"],
] as const;

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

/**
 * Whether a diff line names files or ranges rather than changing a line. A
 * removed `-- comment` reads `--- comment`, so `---` and `+++` name files only
 * beside the line they pair with. A removed `-- ` line directly above an added
 * `++ ` line still reads as a file pair, which only hunk line counts settle.
 */
function isDiffHeader(line: string, previous: string, next: string) {
  return (
    /^(?:diff |index |\*\*\*)/u.test(line) ||
    /^--- \d+(?:,\d+)? ----$/u.test(line) ||
    (line.startsWith("--- ") &&
      (next.startsWith("+++ ") || previous.startsWith("*** "))) ||
    (line.startsWith("+++ ") && previous.startsWith("--- "))
  );
}

function diffTokens(code: string) {
  const lines = [...code.matchAll(/^.+$/gmu)];

  return lines.flatMap(({ 0: line, index }, at) => {
    const ink = isDiffHeader(
      line,
      lines[at - 1]?.[0] ?? "",
      lines[at + 1]?.[0] ?? ""
    )
      ? "var(--syntax-comment)"
      : DIFF_INKS.find(([prefix]) => prefix.test(line))?.[1];

    return ink === undefined
      ? []
      : [{ color: ink, length: line.length, offset: index }];
  });
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
  if (DIFF.has(language)) {
    return diffTokens(code);
  }

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
