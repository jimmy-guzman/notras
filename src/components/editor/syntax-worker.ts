import {
  applyColorReplacements,
  createBundledHighlighter,
  guessEmbeddedLanguages,
  resolveColorReplacements,
} from "shiki/core";
import type { Grammar } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages } from "shiki/langs";
import { EncodedTokenMetadata, INITIAL } from "shiki/textmate";
import type { StateStack } from "shiki/textmate";

import type {
  SyntaxRequest,
  SyntaxResponse,
  SyntaxSplice,
  SyntaxToken,
} from "@/components/editor/syntax-highlighter";
import { syntaxTheme } from "@/components/editor/syntax-theme";
import { reasonOf } from "@/lib/ui/failure";

const createHighlighter = createBundledHighlighter<string, string>({
  // The desktop CSP does not permit WebAssembly compilation.
  engine: () => createJavaScriptRegexEngine(),
  langs: bundledLanguages,
  themes: {},
});

let highlighter: ReturnType<typeof createHighlighter> | undefined;

async function loadHighlighter() {
  try {
    return await createHighlighter({ langs: [], themes: [syntaxTheme] });
  } catch (error) {
    highlighter = undefined;
    throw error;
  }
}

/** A document's lines and the grammar state at the end of each. */
interface Tokenized {
  lines: string[];
  states: StateStack[];
}

const DOCUMENT_LIMIT = 32;
const documents = new Map<number, Tokenized>();

function remember(document: number, tokenized: Tokenized) {
  documents.delete(document);
  documents.set(document, tokenized);
  for (const oldest of documents.keys()) {
    if (documents.size <= DOCUMENT_LIMIT) {
      break;
    }
    documents.delete(oldest);
  }
}

function commonPrefix(a: string[], b: string[]) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) {
    n += 1;
  }
  return n;
}

function commonSuffix(a: string[], b: string[], prefix: number) {
  let n = 0;
  while (
    n < a.length - prefix &&
    n < b.length - prefix &&
    a[a.length - 1 - n] === b[b.length - 1 - n]
  ) {
    n += 1;
  }
  return n;
}

type ColorOf = (metadata: number) => string | undefined;

function tokenizeLine(
  grammar: Grammar,
  colorOf: ColorOf,
  line: string,
  state: StateStack
) {
  // Shiki skips empty lines and strips the carriage return, so this does too.
  const text = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (text === "") {
    return { state, tokens: [] };
  }
  const { ruleStack, tokens: raw } = grammar.tokenizeLine2(text, state);
  const tokens: SyntaxToken[] = [];
  // Pairs of start index and encoded metadata; the last run ends at the line end.
  for (let i = 0; i < raw.length; i += 2) {
    const offset = raw[i];
    const metadata = raw[i + 1];
    if (offset === undefined || metadata === undefined) {
      throw new RangeError("The grammar answered an odd token stream");
    }
    const end = raw[i + 2] ?? text.length;
    const color = colorOf(metadata);
    if (end > offset && color !== undefined) {
      tokens.push({ color, length: end - offset, offset });
    }
  }
  return { state: ruleStack, tokens };
}

/**
 * Tokenize from the first line that differs from the last text seen for this
 * document, and stop once a kept line ends in the grammar state it ended in
 * before, since every line after it tokenizes the same.
 */
function retokenize(
  grammar: Grammar,
  colorOf: ColorOf,
  previous: Tokenized | undefined,
  lines: string[]
) {
  const before = previous ?? { lines: [], states: [] };
  const start = commonPrefix(before.lines, lines);
  const suffix = commonSuffix(before.lines, lines, start);
  const shift = before.lines.length - lines.length;
  const out: SyntaxToken[][] = [];
  const states: StateStack[] = [];
  let state = before.states[start - 1] ?? INITIAL;
  let line = start;
  while (line < lines.length) {
    const result = tokenizeLine(grammar, colorOf, lines[line] ?? "", state);
    ({ state } = result);
    out.push(result.tokens);
    states.push(state);
    line += 1;
    const kept = before.states[line - 1 + shift];
    if (
      line >= lines.length - suffix &&
      kept !== undefined &&
      state.equals(kept)
    ) {
      break;
    }
  }
  const tail = lines.length - line;
  return {
    splice: { lines: out, start, tail },
    tokenized: {
      lines,
      states: [
        ...before.states.slice(0, start),
        ...states,
        ...before.states.slice(before.states.length - tail),
      ],
    },
  };
}

/** Tokenize a code block's changed lines, loading any packaged grammar it names first. */
export async function tokenize(
  code: string,
  language: string,
  document: number
): Promise<SyntaxSplice> {
  highlighter ??= loadHighlighter();
  const instance = await highlighter;
  const loaded = new Set(instance.getLoadedLanguages());
  // Markdown's YAML grammar is needed before a frontmatter block is closed.
  const missing = [
    language,
    ...(language === "markdown" ? ["yaml"] : []),
    ...guessEmbeddedLanguages(code, language),
  ].filter((name) => name in bundledLanguages && !loaded.has(name));
  if (missing.length > 0) {
    await instance.loadLanguage(...missing);
    // Loading a language Markdown embeds rebuilds the Markdown grammar, and
    // every remembered state points into the old one.
    documents.clear();
  }
  // The theme's colors are CSS variables, which the color map holds as placeholders.
  const { colorMap, theme } = instance.setTheme("notras");
  const replacements = resolveColorReplacements(theme);
  const { splice, tokenized } = retokenize(
    instance.getLanguage(language),
    (metadata) =>
      applyColorReplacements(
        colorMap[EncodedTokenMetadata.getForeground(metadata)],
        replacements
      ),
    documents.get(document),
    code.split("\n")
  );
  remember(document, tokenized);

  return splice;
}

async function respond({ code, document, id, language }: SyntaxRequest) {
  let response: SyntaxResponse;
  try {
    response = { id, ...(await tokenize(code, language, document)) };
  } catch (error) {
    response = { error: reasonOf(error) ?? "The grammar failed to load.", id };
  }
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker scope's second argument is a transfer list, not an origin
  self.postMessage(response);
}

// One request at a time: a splice describes the change since the answer
// before it, so answers for a document must leave in the order they arrived.
let queue = Promise.resolve();

self.addEventListener("message", (event: MessageEvent<SyntaxRequest>) => {
  // oxlint-disable-next-line promise/prefer-await-to-then -- the request queue chains each answer on the one before it
  queue = queue.then(async () => {
    await respond(event.data);
  });
});
