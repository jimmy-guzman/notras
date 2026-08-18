export interface TagQuery {
  /** Free text after the tag token, searched within the tag. */
  query: string;
  /** The tag token, without its `#`. Empty while the user has typed only `#`. */
  tag: string;
}

/** Any whitespace ends the tag token: a pasted tab reaches a text input intact. */
const TOKEN_SEPARATOR = /\s+/;

/**
 * Split a palette query on its leading `#` tag token.
 *
 * Returns `undefined` when the input is not a tag query, which is what tells
 * the palette to run an ordinary full-text search.
 */
export function parseTagQuery(input: string): TagQuery | undefined {
  const trimmed = input.trimStart();

  if (!trimmed.startsWith("#")) {
    return;
  }

  const [token = "", ...rest] = trimmed.slice(1).split(TOKEN_SEPARATOR);

  return { query: rest.join(" ").trim(), tag: token.toLowerCase() };
}
