export const truncate = (content: string, maxLength: number) => {
  if (content.length <= maxLength) return content;

  return `${content.slice(0, Math.max(0, maxLength))}...`;
};
