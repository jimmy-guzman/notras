import type { SelectNote } from "@/server/db/schemas/notes";

import { NoteCard } from "./note-card";

export const NotesList = ({ notes }: { notes: SelectNote[] }) => {
  return (
    <div className="animate-in fade-in-0 grid grid-cols-1 gap-4 duration-300 md:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => {
        return <NoteCard key={note.id} note={note} />;
      })}
    </div>
  );
};
