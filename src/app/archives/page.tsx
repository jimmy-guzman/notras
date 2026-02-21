import type { SearchParams } from "nuqs/server";

import { Info } from "lucide-react";
import Link from "next/link";

import {
  getArchivedNotes,
  loadSearchParams,
} from "@/actions/get-archived-notes";
import { ArchivedNoteCard } from "@/components/notes/archived-note-card";
import { NotesFilters } from "@/components/notes/notes-filters";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function Page({ searchParams }: PageProps) {
  const notes = await getArchivedNotes(await loadSearchParams(searchParams));

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between">
          <NotesFilters />
        </div>
        {notes.length === 0 ? (
          <Alert className="text-center">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <p>
                No archived notes yet.{" "}
                <Link
                  className="inline underline hover:no-underline"
                  href="/notes"
                >
                  Browse your notes
                </Link>{" "}
                to archive some.
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="animate-in fade-in-0 grid grid-cols-1 gap-4 duration-300 md:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => {
              return <ArchivedNoteCard key={note.id} note={note} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
