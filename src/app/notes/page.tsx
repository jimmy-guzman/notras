import type { SearchParams } from "nuqs/server";

import { Info, Plus } from "lucide-react";
import Link from "next/link";

import { getNotes, loadSearchParams } from "@/actions/get-notes";
import { NotesList } from "@/components/notes/notes";
import { NotesFilters } from "@/components/notes/notes-filters";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function Page({ searchParams }: PageProps) {
  const notes = await getNotes(await loadSearchParams(searchParams));

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-4">
        <div className="flex justify-end gap-2 lg:justify-between">
          <NotesFilters />
          <Button asChild size="sm" variant="outline">
            <Link href="/notes/new">
              <Plus className="h-4 w-4" />
              New Note
            </Link>
          </Button>
        </div>
        {notes.length === 0 ? (
          <Alert className="text-center">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <p>
                No notes found.{" "}
                <Link
                  className="underline hover:no-underline"
                  href="/notes/new"
                >
                  Create your first note
                </Link>{" "}
                to get started.
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <NotesList notes={notes} />
        )}
      </div>
    </div>
  );
}
