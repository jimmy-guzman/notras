import type { SearchParams } from "nuqs/server";

import { InfoIcon, NotebookTextIcon, PinIcon, SearchIcon } from "lucide-react";
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
  const isFiltering = Boolean(params.q) || params.time !== "all";

  const [pinnedNotes, unpinnedNotes] = isFiltering
    ? [[], await getNotes(params)]
    : await Promise.all([
        getNotes(params, { pinnedOnly: true }),
        getNotes(params, { excludePinned: true }),
      ]);

  const totalCount = pinnedNotes.length + unpinnedNotes.length;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-4">
        <NotesFilters />

        {isFiltering && totalCount > 0 && (
          <p className="text-sm text-muted-foreground">
            found {totalCount} {totalCount === 1 ? "note" : "notes"}
          </p>
        )}

        {totalCount === 0 ? (
          <Alert className="text-center">
            {isFiltering ? (
              <>
                <SearchIcon className="h-4 w-4" />
                <AlertDescription>no notes match your search.</AlertDescription>
              </>
            ) : (
              <>
                <InfoIcon className="h-4 w-4" />
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
          <>
            {pinnedNotes.length > 0 && (
              <div className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2">
                  <PinIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    pinned
                  </span>
                </h2>
                <NotesList notes={pinnedNotes} query={params.q} />
              </div>
            )}
            {unpinnedNotes.length > 0 && (
              <div className="flex flex-col gap-3">
                {pinnedNotes.length > 0 && (
                  <h2 className="flex items-center gap-2">
                    <NotebookTextIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      notes
                    </span>
                  </h2>
                )}
                <NotesList notes={unpinnedNotes} query={params.q} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
