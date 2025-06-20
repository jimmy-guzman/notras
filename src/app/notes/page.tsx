import type { SearchParams } from "nuqs/server";

import { getNotes, loadSearchParams } from "@/actions/get-notes";
import { NewNote } from "@/components/new-note";
import { NotesList } from "@/components/notes";
import { NotesFilters } from "@/components/notes-filters";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const notes = await getNotes(await loadSearchParams(searchParams));

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between">
        <NotesFilters />
        <NewNote />
      </div>
      <NotesList notes={notes} />
    </div>
  );
}
