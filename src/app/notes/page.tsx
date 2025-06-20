import type { SearchParams } from "nuqs/server";

import { Plus } from "lucide-react";
import Link from "next/link";

import { getNotes, loadSearchParams } from "@/actions/get-notes";
import { NotesList } from "@/components/notes/notes";
import { NotesFilters } from "@/components/notes/notes-filters";
import { Button } from "@/components/ui/button";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function Page({ searchParams }: PageProps) {
  const notes = await getNotes(await loadSearchParams(searchParams));

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between">
        <NotesFilters />
        <Button asChild variant="outline">
          <Link href="/notes/new">
            <Plus className="h-4 w-4" />
            New Note
          </Link>
        </Button>
      </div>
      <NotesList notes={notes} />
    </div>
  );
}
