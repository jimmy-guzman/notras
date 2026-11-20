import { codeToTokens, isSupportedLanguage } from "@pierre/highlights";
import type { Lang } from "@pierre/highlights";

import { parseNote } from "@/core/frontmatter";

import { syntaxTheme } from "./syntax-theme";

/** One styled run of code; `offset` counts from the start of the code. */
export interface SyntaxToken {
  color: string;
  /** CSS for an italic, bold or struck run, such as Markdown emphasis. */
  font?: string;
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

/**
 * The runs that are not plain text, which needs no decoration. As the default
 * of a theme set, the theme comes back as each run's inline CSS, font included.
 */
function styledTokens(code: string, lang: Lang, shift: number) {
  const { fg, tokens } = codeToTokens(code, {
    defaultColor: "notras",
    lang,
    themes: { notras: syntaxTheme },
  });

  return tokens.flat().flatMap(({ content, htmlStyle = {}, offset }) => {
    const { color, ...font } = htmlStyle;

    const run = {
      color: color === undefined || color === fg ? "inherit" : color,
      length: content.length,
      offset: offset + shift,
    };

    const declarations = Object.entries(font).map(
      ([property, value]) => `${property}: ${value}`
    );

    if (declarations.length === 0) {
      return run.color === "inherit" ? [] : [run];
    }

    return [{ ...run, font: declarations.join("; ") }];
  });
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

/**
 * The Markdown lexer opens frontmatter on any leading `---`. A leading newline
 * keeps it out of text the app reads as Markdown.
 */
function markdownTokens(markdown: string, lang: Lang, shift: number) {
  return styledTokens(`\n${markdown}`, lang, shift - 1);
}

/** A leading `---` over a line the YAML lexer opens with a key: frontmatter being typed. */
function opensWithKey(code: string) {
  const second = /^---\r?\n(?<line>.*)/u.exec(code)?.groups?.line;

  const [first] =
    second === undefined ? [] : styledTokens(second.trimStart(), "yaml", 0);

  return first?.offset === 0 && first.color === "var(--syntax-member)";
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
 * A note's frontmatter is what `parseNote` says it is: the Markdown lexer
 * closes a block on `---` alone and would read the body after `...` as YAML,
 * and it opens one on a rule the app reads as Markdown. A block still being
 * typed, with a key under its opening line, keeps the lexer's YAML colors.
 */
export function highlightCode(code: string, language: Lang): SyntaxToken[] {
  if (DIFF.has(language)) {
    return diffTokens(code);
  }

  if (!MARKDOWN.has(language)) {
    return styledTokens(code, language, 0);
  }

  const { body, raw } = parseNote(code);

  if (raw === undefined) {
    return opensWithKey(code)
      ? styledTokens(code, language, 0)
      : markdownTokens(code, language, 0);
  }

  const head = code.slice(0, code.length - body.length);

  return [
    ...styledTokens(head, "yaml", 0),
    ...markdownTokens(body, language, head.length),
  ];
}
