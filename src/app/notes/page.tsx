import type { SearchParams } from "nuqs/server";

import { getNotes, loadSearchParams } from "@/actions/get-notes";
import { NotesList } from "@/components/notes";
import { NotesFilters } from "@/components/notes-filters";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const notes = await getNotes(await loadSearchParams(searchParams));

  return (
    <div>
      <div className="container mx-auto px-4 py-6">
        <NotesFilters />
        <NotesList notes={notes} />
      </div>
    </div>
  );
}
