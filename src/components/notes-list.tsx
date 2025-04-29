import { getNotes } from "@/actions/get-notes";

import { NotesListItems } from "./notes-list-items";

interface NotesListProps {
  query?: string;
}

export async function NotesList({ query = "" }: NotesListProps) {
  const notes = await getNotes();

  const filteredNotes = notes.filter((note) => {
    return note.content.toLowerCase().includes(query.toLowerCase());
  });

  return filteredNotes.length > 0 ? (
    <NotesListItems filteredNotes={filteredNotes} query={query} />
  ) : (
    <p className="text-muted-foreground text-center text-sm italic">
      {query
        ? "No matching notes."
        : "No notes yet. Start by writing your first thought."}
    </p>
  );
}
