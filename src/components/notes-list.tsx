"use client";

import { format } from "date-fns";
import { useMemo, useState } from "react";

import type { Kind } from "@/lib/kind";

import { KIND_LABELS } from "@/lib/kind";
import { groupNotesByTime } from "@/lib/utils/group-notes-by-time";

import { ArchiveNote } from "./archive-note";
import { CopyNote } from "./copy-note";
import { EditNoteButton } from "./edit-note-button";
import { NoteContent } from "./note-content";
import { PinNote } from "./pin-note";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

interface Note {
  content: string;
  createdAt: Date;
  id: string;
  kind: Kind | null;
  pinnedAt: Date | null;
}

interface NotesListProps {
  notes: Note[];
  query?: string;
}

export function NotesList({ notes, query }: NotesListProps) {
  const [editingNoteId, setEditingNoteId] = useState<null | string>(null);

  const groupedNotes = useMemo(() => {
    return groupNotesByTime(notes);
  }, [notes]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-12">
      {groupedNotes.map(({ label, notes }, index) => {
        const isLast = index === groupedNotes.length - 1;

        return (
          <div className="flex flex-col gap-6" key={label}>
            {label && (
              <h2 className="text-muted-foreground text-sm font-medium transition-opacity">
                {label}
              </h2>
            )}

            {notes.map((note) => {
              return (
                <div
                  className="border-muted/30 hover:bg-muted/10 flex flex-col gap-1 rounded-sm border-b pb-3 transition-colors"
                  key={note.id}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-muted-foreground flex items-center gap-2 text-sm opacity-70">
                      <span className="sm:hidden">
                        {format(note.createdAt, "MMM d, h:mm a")}
                      </span>
                      <span className="hidden sm:inline">
                        {format(note.createdAt, "PPP pp")}
                      </span>
                      {note.kind && (
                        <Badge className="text-xs capitalize" variant="outline">
                          {KIND_LABELS[note.kind]}
                        </Badge>
                      )}
                    </div>

                    <div className="text-muted-foreground flex items-center gap-1">
                      <EditNoteButton
                        isEditing={editingNoteId === note.id}
                        onClick={() => {
                          setEditingNoteId((current) => {
                            return current === note.id ? null : note.id;
                          });
                        }}
                      />
                      <PinNote
                        noteId={note.id}
                        pinned={Boolean(note.pinnedAt)}
                      />
                      <CopyNote content={note.content} />
                      <ArchiveNote noteId={note.id} />
                    </div>
                  </div>

                  <NoteContent
                    content={note.content}
                    id={note.id}
                    isEditing={editingNoteId === note.id}
                    onCancelEdit={() => {
                      setEditingNoteId(null);
                    }}
                    onSave={() => {
                      setEditingNoteId(null);
                    }}
                    query={query}
                  />
                </div>
              );
            })}

            {!isLast && <Separator className="opacity-40" />}
          </div>
        );
      })}
    </div>
  );
}
