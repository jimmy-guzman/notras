export const truncate = (content: string, maxLength: number): string => {
  if (content.length <= maxLength) return content;

  const sliced = content.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");

  return `${lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced}...`;
};
