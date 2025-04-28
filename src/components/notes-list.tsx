import { format } from "date-fns";

import { getNotes } from "@/actions/get-notes";

import { ArchiveNote } from "./archive-note";

interface NotesListProps {
  query?: string;
}

export async function NotesList({ query = "" }: NotesListProps) {
  const notes = await getNotes();

  const filteredNotes = notes.filter((note) => {
    return note.content.toLowerCase().includes(query.toLowerCase());
  });

  return filteredNotes.length > 0 ? (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      {filteredNotes.map((note) => {
        return (
          <div className="flex flex-col gap-2" key={note.id}>
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground text-sm opacity-70">
                {format(note.createdAt, "PPP pp")}
              </div>
              <ArchiveNote noteId={note.id} />
            </div>
            <div className="text-base">{note.content}</div>
          </div>
        );
      })}
    </div>
  ) : (
    <p className="text-muted-foreground text-center text-sm italic">
      {query
        ? "No matching notes."
        : "No notes yet. Start by writing your first thought."}
    </p>
  );
}
