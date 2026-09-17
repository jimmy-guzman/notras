import { createBundledHighlighter, guessEmbeddedLanguages } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages } from "shiki/langs";

import type {
  SyntaxRequest,
  SyntaxResponse,
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

/** Tokenize one code block, loading any packaged grammar it names first. */
export async function tokenize(
  code: string,
  language: string
): Promise<SyntaxToken[][]> {
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
  }

  return instance
    .codeToTokensBase(code, { lang: language, theme: "notras" })
    .map((line) =>
      line.flatMap((token) =>
        token.content.length === 0 || token.color === undefined
          ? []
          : [
              {
                color: token.color,
                length: token.content.length,
                offset: token.offset,
              },
            ]
      )
    );
}

async function respond({ code, id, language }: SyntaxRequest) {
  let response: SyntaxResponse;
  try {
    response = { id, lines: await tokenize(code, language) };
  } catch (error) {
    response = { error: reasonOf(error) ?? "The grammar failed to load.", id };
  }
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker scope's second argument is a transfer list, not an origin
  self.postMessage(response);
}

self.addEventListener("message", (event: MessageEvent<SyntaxRequest>) => {
  void respond(event.data);
});
