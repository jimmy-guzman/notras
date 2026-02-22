import type { SelectNote } from "@/server/db/schemas/notes";

import { AnimatedNoteCard } from "./animated-note-card";
import { NoteCard } from "./note-card";

export const NotesList = ({
  notes,
  query,
}: {
  notes: SelectNote[];
  query?: string;
}) => {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {notes.map((note, index) => {
        return (
          <AnimatedNoteCard index={index} key={note.id}>
            <NoteCard note={note} query={query} />
          </AnimatedNoteCard>
        );
      })}
    </div>
  );
};
