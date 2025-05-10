"use client";

import { useEffect, useMemo, useState } from "react";

import { updateNote } from "@/actions/update-note";
import { cn } from "@/lib/ui/utils";
import { getHighlightedParts } from "@/lib/utils/highlight";

import { Textarea } from "./ui/textarea";

interface NoteContentProps {
  content: string;
  id: string;
  isEditing: boolean;
  onCancelEdit: () => void;
  onSave?: () => void;
  query?: string;
}

export function NoteContent({
  content,
  id,
  isEditing,
  onCancelEdit,
  onSave,
  query,
}: NoteContentProps) {
  const parts = useMemo(() => {
    return getHighlightedParts(content, query ?? "");
  }, [content, query]);

  const [draft, setDraft] = useState(content);

  useEffect(() => {
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- this is okay
    setDraft(content);
  }, [content]);

  const handleSave = async () => {
    const trimmed = draft.trim();

    if (trimmed === content.trim()) {
      onSave?.();
    } else {
      await updateNote(id, trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(content);
      onCancelEdit();
    }
  };

  if (isEditing) {
    return (
      <Textarea
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        value={draft}
      />
    );
  }

  return (
    <div
      className={cn("text-sm whitespace-pre-wrap", query && "leading-relaxed")}
    >
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
}
