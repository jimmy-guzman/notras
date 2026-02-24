import { BellIcon } from "lucide-react";
import Link from "next/link";

import type { SelectNote } from "@/server/db/schemas/notes";

import { toNoteId } from "@/lib/id";
import { formatDate } from "@/lib/utils/format";
import { getHighlightedParts } from "@/lib/utils/highlight";
import { truncate } from "@/lib/utils/truncate";

import { Card, CardContent, CardFooter } from "../ui/card";
import { PinNoteButton } from "./pin-note-button";

const MAX_CONTENT_LENGTH = 120;

export const NoteCard = ({
  note,
  query,
}: {
  note: SelectNote;
  query?: string;
}) => {
  const displayContent = truncate(note.content, MAX_CONTENT_LENGTH);

  return (
    <Link
      className="group block focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      href={`/notes/${note.id}`}
    >
      <Card className="relative flex cursor-pointer flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
        <PinNoteButton
          className="absolute top-2 right-2 z-10"
          noteId={toNoteId(note.id)}
          pinned={Boolean(note.pinnedAt)}
        />
        <CardContent className="flex-1 py-4">
          <p className="truncate text-sm leading-relaxed text-foreground transition-colors group-hover:text-foreground/90">
            {query
              ? getHighlightedParts(displayContent, query).map((part) => {
                  return part.match ? (
                    <mark
                      className="bg-yellow-200 text-inherit dark:bg-yellow-800"
                      key={part.id}
                    >
                      {part.text}
                    </mark>
                  ) : (
                    <span key={part.id}>{part.text}</span>
                  );
                })
              : displayContent}
          </p>
        </CardContent>
        <CardFooter className="border-t">
          <span className="flex items-center gap-2 text-xs text-muted-foreground transition-colors group-hover:text-muted-foreground/80">
            {formatDate(note.createdAt)}
            {note.remindAt && <BellIcon className="h-3 w-3" />}
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
};
