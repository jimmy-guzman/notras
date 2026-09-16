import { PinIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { NoteMeta } from "@/core/notes";
import { getSnippetParts } from "@/lib/utils/fts-snippet";

export function Highlighted({
  className,
  text,
}: {
  className: string;
  text: string;
}) {
  return (
    <span className={className}>
      {getSnippetParts(text).map((part) =>
        part.match ? (
          <mark
            className="bg-primary/20 text-foreground rounded-xs"
            key={part.id}
          >
            {part.text}
          </mark>
        ) : (
          <span key={part.id}>{part.text}</span>
        )
      )}
    </span>
  );
}

export function NoteLabel({
  children,
  note,
}: {
  children?: ReactNode;
  note: NoteMeta;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={note.path}>
      <Highlighted className="truncate" text={note.title} />
      {note.pinned ? (
        <PinIcon aria-label="pinned" className="size-3 opacity-60" />
      ) : null}
      {note.folder === "" ? null : (
        <span className="text-muted-foreground max-w-1/3 shrink-0 truncate text-xs">
          {note.folder}
        </span>
      )}
      {children}
    </span>
  );
}
