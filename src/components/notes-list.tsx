import type { Kind } from "@/lib/kind";

import { getNotes } from "@/actions/get-notes";

import { NotesListItems } from "./notes-list-items";

interface NotesListProps {
  kind?: Kind;
  query?: string;
}

export async function NotesList({ kind, query = "" }: NotesListProps) {
  const notes = await getNotes({ kind, query });

  if (notes.length > 0) {
    return <NotesListItems filteredNotes={notes} query={query} />;
  }

  const hasNoMatchingNotes = query || kind;

  return (
    <p className="text-muted-foreground text-center text-sm italic">
      {hasNoMatchingNotes
        ? "No matching notes."
        : "No notes yet. Start by writing your first thought."}
    </p>
  );
}
