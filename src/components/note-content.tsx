import { useMemo } from "react";

import { getHighlightedParts } from "@/lib/utils/highlight";

interface NoteContentProps {
  content: string;
  query?: string;
}

export const NoteContent = ({ content, query }: NoteContentProps) => {
  const parts = useMemo(() => {
    return getHighlightedParts(content, query ?? "");
  }, [content, query]);

  return (
    <div className="text-base">
      {parts.map((part) => {
        return part.match ? (
          <mark
            className="text-primary bg-transparent font-semibold"
            key={part.id}
          >
            {part.text}
          </mark>
        ) : (
          part.text
        );
      })}
    </div>
  );
};
