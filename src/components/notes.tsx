import type { Kind } from "@/lib/kind";

import { NoteCard } from "./note-card";

interface Note {
  content: string;
  createdAt: Date;
  id: string;
  kind: Kind | null;
  metadata: null | {
    aiKindInferred?: boolean;
  };
}

export const NotesList = ({ notes }: { notes: Note[] }) => {
  return (
    <div className="animate-in fade-in-0 grid grid-cols-1 gap-4 duration-300 md:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </div>
  );
};
