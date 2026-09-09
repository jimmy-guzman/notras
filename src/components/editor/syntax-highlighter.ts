import { createBundledHighlighter } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages, bundledLanguagesInfo } from "shiki/langs";
import type { HighlighterCore } from "shiki/types";

import { syntaxTheme } from "@/components/editor/syntax-theme";

const createHighlighter = createBundledHighlighter<string, string>({
  // The desktop CSP does not permit WebAssembly compilation.
  engine: () => createJavaScriptRegexEngine(),
  langs: bundledLanguages,
  themes: {},
});

let highlighter: ReturnType<typeof createHighlighter> | undefined;

async function initializeHighlighter() {
  try {
    return await createHighlighter({ langs: [], themes: [syntaxTheme] });
  } catch (error) {
    highlighter = undefined;
    throw error;
  }
}

export const codeLanguages = bundledLanguagesInfo.map(({ id }) => id);

/** Resolve an explicit fence label without changing what is saved to the file. */
export function syntaxLanguage(language: unknown): string | undefined {
  if (typeof language !== "string") {
    return undefined;
  }

  const label = language.toLowerCase();

  return bundledLanguagesInfo.find(
    ({ aliases, id }) => id === label || aliases?.includes(label)
  )?.id;
}

/** Load packaged grammars once per webview; no network service receives code. */
export async function loadSyntaxHighlighter(
  languages: string[]
): Promise<HighlighterCore> {
  highlighter ??= initializeHighlighter();
  const instance = await highlighter;
  await instance.loadLanguage(...languages);

  return instance;
}
