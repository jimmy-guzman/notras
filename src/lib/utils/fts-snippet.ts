import { SNIPPET_END, SNIPPET_START } from "@/core/fts-markers";

const SNIPPET_SPLIT_RE = new RegExp(
  `(${RegExp.escape(SNIPPET_START)}|${RegExp.escape(SNIPPET_END)})`,
  "u"
);

interface SnippetPart {
  id: number;
  match: boolean;
  text: string;
}

export function getSnippetParts(snippet: string): SnippetPart[] {
  const tokens = snippet.split(SNIPPET_SPLIT_RE);

  let isMatch = false;

  return tokens.flatMap((token, id) => {
    if (token === SNIPPET_START) {
      isMatch = true;

      return [];
    }

    if (token === SNIPPET_END) {
      isMatch = false;

      return [];
    }

    if (token.length === 0) {
      return [];
    }

    return [{ id, match: isMatch, text: token }];
  });
}
