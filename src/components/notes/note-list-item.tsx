"use client";

import { useDraggable } from "@dnd-kit/react";
import { BellIcon, FolderIcon, GripVerticalIcon } from "lucide-react";
import Link from "next/link";

import type { SelectTag } from "@/server/db/schemas/tags";
import type { NoteWithFolder } from "@/server/repositories/note-repository";

import { toNoteId } from "@/lib/id";
import { cn } from "@/lib/ui/utils";
import { formatDate } from "@/lib/utils/format";
import { getHighlightedParts } from "@/lib/utils/highlight";
import { truncate } from "@/lib/utils/truncate";

import { NoteTags } from "./note-tags";
import { PinNoteButton } from "./pin-note-button";

const MAX_CONTENT_LENGTH = 200;
const EMPTY_TAGS: SelectTag[] = [];

export const NoteListItem = ({
  currentParams,
  folderName,
  note,
  query,
  tags = EMPTY_TAGS,
}: {
  currentParams?: { folder?: string; q?: string; tag?: string; time?: string };
  folderName?: string;
  note: NoteWithFolder;
  query?: string;
  tags?: SelectTag[];
}) => {
  const displayContent = truncate(note.content, MAX_CONTENT_LENGTH);
  const noteId = toNoteId(note.id);
  const { handleRef, isDragging, ref } = useDraggable({ id: noteId });

  const showFolder =
    folderName !== undefined && currentParams?.folder !== note.folderId;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted",
        isDragging && "opacity-50",
      )}
      ref={ref}
    >
      <button
        aria-label="drag to reorder"
        className="cursor-grab touch-none text-muted-foreground/40 transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
        ref={handleRef}
        type="button"
      >
        <GripVerticalIcon className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
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
        {tags.length > 0 && (
          <div className="mt-1">
            <NoteTags currentParams={currentParams} tags={tags} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {note.remindAt && <BellIcon className="h-3 w-3" />}
            {formatDate(note.createdAt)}
          </span>
          <PinNoteButton
            noteId={noteId}
            pinned={Boolean(note.pinnedAt)}
            size="icon-xs"
          />
        </div>
        {showFolder && (
          <Link
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            href={`/notes?folder=${note.folderId}`}
          >
            <FolderIcon className="h-3 w-3" />
            {folderName}
          </Link>
        )}
      </div>
    </div>
  );
};
