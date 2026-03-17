import type { SearchParams } from "nuqs/server";

import { InfoIcon, NotebookTextIcon, PinIcon, SearchIcon } from "lucide-react";
import Link from "next/link";

import { getFolders } from "@/actions/get-folders";
import {
  getNotesWithFolder,
  getTagsForNotes,
  loadSearchParams,
} from "@/actions/get-notes";
import { ActiveFiltersChip } from "@/components/notes/active-filters-chip";
import { NotesList } from "@/components/notes/notes";
import { NotesFilters } from "@/components/notes/notes-filters";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toNoteId } from "@/lib/id";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await loadSearchParams(searchParams);
  const isFiltering =
    Boolean(params.q) ||
    params.time !== "all" ||
    Boolean(params.tag) ||
    Boolean(params.folder);

  const [[pinnedNotes, unpinnedNotes], folders] = await Promise.all([
    isFiltering
      ? Promise.all([getNotesWithFolder(params), Promise.resolve([])])
      : Promise.all([
          getNotesWithFolder(params, { pinnedOnly: true }),
          getNotesWithFolder(params, { excludePinned: true }),
        ]),
    getFolders(),
  ]);

  const allNotes = [...pinnedNotes, ...unpinnedNotes];
  const totalCount = allNotes.length;
  const noteIds = allNotes.map((n) => toNoteId(n.id));
  const tagMap = noteIds.length > 0 ? await getTagsForNotes(noteIds) : {};

  const activeFolder = params.folder
    ? folders.find((f) => f.id === params.folder)
    : undefined;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-4">
        <NotesFilters />

        {isFiltering && totalCount > 0 && (
          <ActiveFiltersChip
            activeFolder={activeFolder}
            totalCount={totalCount}
          />
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
                  currentParams={{
                    folder: params.folder,
                    q: params.q,
                    tag: params.tag,
                    time: params.time,
                  }}
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
                  currentParams={{
                    folder: params.folder,
                    q: params.q,
                    tag: params.tag,
                    time: params.time,
                  }}
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
