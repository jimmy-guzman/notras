function escapeRegExp(string: string): string {
  return string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

export function getHighlightedParts(text: string, query: string) {
  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);

  if (terms.length === 0) return [{ id: -1, match: false, text }];

  const normalizedTerms = new Set(terms.map((term) => term.toLowerCase()));
  const pattern = terms.map(escapeRegExp).join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "gi"));

  return parts
    .map((part, id) => {
      return {
        id,
        match: normalizedTerms.has(part.toLowerCase()),
        text: part,
      };
    })
    .filter((part) => part.match || part.text.length > 0);
}
