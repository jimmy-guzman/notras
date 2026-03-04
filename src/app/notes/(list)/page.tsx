import type { SearchParams } from "nuqs/server";

import { InfoIcon, NotebookTextIcon, PinIcon, SearchIcon } from "lucide-react";
import Link from "next/link";

import {
  getNotes,
  getTagsForNotes,
  loadSearchParams,
} from "@/actions/get-notes";
import { NotesList } from "@/components/notes/notes";
import { NotesFilters } from "@/components/notes/notes-filters";
import { TagFilterChip } from "@/components/notes/tag-filter-chip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toNoteId } from "@/lib/id";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await loadSearchParams(searchParams);
  const isFiltering =
    Boolean(params.q) || params.time !== "all" || Boolean(params.tag);

  const [pinnedNotes, unpinnedNotes] = isFiltering
    ? [[], await getNotes(params)]
    : await Promise.all([
        getNotes(params, { pinnedOnly: true }),
        getNotes(params, { excludePinned: true }),
      ]);

  const allNotes = [...pinnedNotes, ...unpinnedNotes];
  const totalCount = allNotes.length;
  const noteIds = allNotes.map((n) => toNoteId(n.id));
  const tagMap = await getTagsForNotes(noteIds);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-4">
        <NotesFilters />

        {isFiltering && totalCount > 0 && (
          <TagFilterChip totalCount={totalCount} />
        )}

        {totalCount === 0 ? (
          <Alert className="text-center">
            {isFiltering ? (
              <>
                <SearchIcon className="h-4 w-4" />
                <AlertDescription>
                  no notes match your filters.
                </AlertDescription>
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
                <NotesList
                  currentParams={{ q: params.q, time: params.time }}
                  notes={pinnedNotes}
                  query={params.q}
                  tagMap={tagMap}
                />
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
                <NotesList
                  currentParams={{ q: params.q, time: params.time }}
                  notes={unpinnedNotes}
                  query={params.q}
                  tagMap={tagMap}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
