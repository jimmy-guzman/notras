export interface TagQuery {
  /** Free text after the tag token, searched within the tag. */
  query: string;
  /** The tag token, without its `#`. Empty while the user has typed only `#`. */
  tag: string;
}

/**
 * Split a palette query on its leading `#` tag token.
 *
 * Returns `undefined` when the input is not a tag query, which is what tells
 * the palette to run an ordinary full-text search.
 */
export function parseTagQuery(input: string): TagQuery | undefined {
  const trimmed = input.trimStart();

  if (!trimmed.startsWith("#")) {
    return undefined;
  }

  const [token = "", ...rest] = trimmed.slice(1).split(" ");

  return { query: rest.join(" ").trim(), tag: token.toLowerCase() };
}
