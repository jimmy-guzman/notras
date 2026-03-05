"use client";

import type { SelectNote } from "@/server/db/schemas/notes";
import type { SelectTag } from "@/server/db/schemas/tags";

import { useViewPreference } from "@/lib/use-view-preference";

import { AnimatedNoteCard } from "./animated-note-card";
import { NoteCard } from "./note-card";
import { NoteListItem } from "./note-list-item";

interface NotesListProps {
  currentParams?: { folder?: string; q?: string; tag?: string; time?: string };
  notes: SelectNote[];
  query?: string;
  tagMap?: Record<string, SelectTag[]>;
}

export const NotesList = ({
  currentParams,
  notes,
  query,
  tagMap,
}: NotesListProps) => {
  const [view, , isHydrated] = useViewPreference();

  if (view === "list") {
    return (
      <div
        className={`flex flex-col divide-y transition-opacity duration-300 ${isHydrated ? "opacity-100" : "opacity-0"}`}
      >
        {notes.map((note, index) => {
          return (
            <AnimatedNoteCard index={index} key={note.id}>
              <NoteListItem
                currentParams={currentParams}
                note={note}
                query={query}
                tags={tagMap?.[note.id] ?? []}
              />
            </AnimatedNoteCard>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-1 gap-4 transition-opacity duration-300 md:grid-cols-2 lg:grid-cols-3 ${isHydrated ? "opacity-100" : "opacity-0"}`}
    >
      {notes.map((note, index) => {
        return (
          <AnimatedNoteCard index={index} key={note.id}>
            <NoteCard
              currentParams={currentParams}
              note={note}
              query={query}
              tags={tagMap?.[note.id] ?? []}
            />
          </AnimatedNoteCard>
        );
      })}
    </div>
  );
};
