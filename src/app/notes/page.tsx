import type { SearchParams } from "nuqs/server";

import { Info, SearchIcon } from "lucide-react";
import Link from "next/link";

import { getNotes, loadSearchParams } from "@/actions/get-notes";
import { NotesList } from "@/components/notes/notes";
import { NotesFilters } from "@/components/notes/notes-filters";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await loadSearchParams(searchParams);
  const notes = await getNotes(params);
  const isSearching = Boolean(params.q);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-4">
        <NotesFilters />

        {isSearching && notes.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Found {notes.length} {notes.length === 1 ? "note" : "notes"}
          </p>
        )}

        {notes.length === 0 ? (
          <Alert className="text-center">
            {isSearching ? (
              <>
                <SearchIcon className="h-4 w-4" />
                <AlertDescription>no notes match your search.</AlertDescription>
              </>
            ) : (
              <>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <p>
                    no notes found.{" "}
                    <Link
                      className="underline hover:no-underline"
                      href="/notes/new"
                    >
                      create your first note
                    </Link>{" "}
                    to get started.
                  </p>
                </AlertDescription>
              </>
            )}
          </Alert>
        ) : (
          <NotesList notes={notes} query={params.q} />
        )}
      </div>
    </div>
  );
}
