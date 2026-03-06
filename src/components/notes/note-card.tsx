"use client";

import { useDraggable } from "@dnd-kit/react";
import { BellIcon } from "lucide-react";
import Link from "next/link";

import type { SelectNote } from "@/server/db/schemas/notes";
import type { SelectTag } from "@/server/db/schemas/tags";

import { toNoteId } from "@/lib/id";
import { formatDate } from "@/lib/utils/format";
import { getHighlightedParts } from "@/lib/utils/highlight";
import { truncate } from "@/lib/utils/truncate";

import { Card, CardContent, CardFooter } from "../ui/card";
import { NoteTags } from "./note-tags";
import { PinNoteButton } from "./pin-note-button";

const MAX_CONTENT_LENGTH = 120;
const EMPTY_TAGS: SelectTag[] = [];

export const NoteCard = ({
  currentParams,
  note,
  query,
  tags = EMPTY_TAGS,
}: {
  currentParams?: { folder?: string; q?: string; tag?: string; time?: string };
  note: SelectNote;
  query?: string;
  tags?: SelectTag[];
}) => {
  const displayContent = truncate(note.content, MAX_CONTENT_LENGTH);
  const noteId = toNoteId(note.id);
  const { isDragging, ref } = useDraggable({ id: noteId });

  return (
    <Card
      className={`group relative flex cursor-pointer flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${isDragging ? "opacity-50" : ""}`}
      ref={ref}
    >
      <PinNoteButton
        className="absolute top-2 right-2 z-10"
        noteId={noteId}
        pinned={Boolean(note.pinnedAt)}
      />
      <CardContent className="flex-1 py-4">
        <Link
          className="block focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          href={`/notes/${note.id}`}
        >
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
        </Link>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 border-t">
        <span className="flex items-center gap-2 text-xs text-muted-foreground transition-colors group-hover:text-muted-foreground/80">
          {formatDate(note.createdAt)}
          {note.remindAt && <BellIcon className="h-3 w-3" />}
        </span>
        <NoteTags currentParams={currentParams} tags={tags} />
      </CardFooter>
    </Card>
  );
};
