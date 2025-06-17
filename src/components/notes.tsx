"use client";

import { useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";

import { useNotes } from "@/hooks/use-notes";
import { parsers } from "@/lib/notes-search-params";

import { NoteCard, NoteCardSkeleton } from "./note-card";
import { Button } from "./ui/button";

export const NotesList = () => {
  const [filters] = useQueryStates(parsers);
  const router = useRouter();

  const { error, isLoading, notes } = useNotes(
    filters.kind === "all" ? undefined : filters.kind,
    filters.time === "all" ? undefined : filters.time,
    filters.sort,
  );

  const handleNoteClick = (noteId: string) => {
    router.push(`/notes/${noteId}`);
  };

  const hasActiveFilters =
    filters.kind !== "all" ||
    filters.time !== "all" ||
    filters.sort !== "newest";

  return (
    <>
      {error && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            Something went wrong loading notes.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              globalThis.location.reload();
            }}
            variant="outline"
          >
            Try again
          </Button>
        </div>
      )}
      {!error && isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => {
            // eslint-disable-next-line @eslint-react/no-array-index-key -- this is okay since it's static data
            return <NoteCardSkeleton key={i} />;
          })}
        </div>
      )}
      {!error && !isLoading && notes.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground mb-4">
            {hasActiveFilters
              ? "No notes match your filters."
              : "No notes yet."}
          </p>
        </div>
      )}
      {!error && !isLoading && notes.length > 0 && (
        <div className="animate-in fade-in-0 grid grid-cols-1 gap-4 duration-300 md:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => {
            return (
              <NoteCard
                handleClick={handleNoteClick}
                key={note.id}
                note={note}
              />
            );
          })}
        </div>
      )}
    </>
  );
};
