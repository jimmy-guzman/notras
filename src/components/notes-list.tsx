"use client";

import { format } from "date-fns";
import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import type { Kind } from "@/lib/kind";

import { KIND_LABELS } from "@/lib/kind";
import { groupNotesByTime } from "@/lib/utils/group-notes-by-time";

import { EditNoteButton } from "./edit-note-button";
import { NoteContent } from "./note-content";
import { NoteActionsDropdown } from "./notes-actions-dropdown";
import { PinNote } from "./pin-note";
import { Badge } from "./ui/badge";

interface Note {
  content: string;
  createdAt: Date;
  id: string;
  kind: Kind | null;
  metadata: null | {
    aiKindInferred?: boolean;
  };
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
      {groupedNotes.map(({ label, notes }) => {
        return (
          <div className="flex flex-col gap-6" key={label}>
            {label && (
              <h2 className="text-muted-foreground p-2 text-sm font-medium transition-opacity">
                {label}
              </h2>
            )}

            {notes.map((note) => {
              return (
                <div
                  className="group hover:bg-muted/40 flex flex-col gap-1 p-2 transition-colors"
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
                      <Badge className="text-xs capitalize" variant="outline">
                        {KIND_LABELS[note.kind ?? "thought"]}
                        {note.metadata?.aiKindInferred && (
                          <Sparkles className="text-muted-foreground ml-1 inline-block h-3 w-3" />
                        )}
                      </Badge>
                    </div>
                    <div className="flex items-center opacity-70 transition-opacity group-hover:opacity-100">
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

                      <NoteActionsDropdown
                        isEditing={editingNoteId === note.id}
                        note={note}
                        onEditToggle={() => {
                          setEditingNoteId((current) => {
                            return current === note.id ? null : note.id;
                          });
                        }}
                      />
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
          </div>
        );
      })}
    </div>
  );
}
