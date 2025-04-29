function escapeRegExp(string: string): string {
  return string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

export function getHighlightedParts(text: string, query: string) {
  if (!query.trim()) return [{ id: -1, match: false, text }];

  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));

  return parts
    .map((part, id) => {
      return {
        id,
        match: part.toLowerCase() === query.toLowerCase(),
        text: part,
      };
    })
    .filter((part) => {
      return part.match || part.text.length > 0;
    });
}
