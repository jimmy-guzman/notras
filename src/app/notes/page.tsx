import { PlusCircle } from "lucide-react";
import { Suspense } from "react";

import { NotesList } from "@/components/notes";
import { NotesFilters } from "@/components/notes-filters";
import { Button } from "@/components/ui/button";

export default function Page() {
  return (
    <div>
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Notes</h1>
            </div>
            <Button disabled size="sm" variant="outline">
              <PlusCircle className="mr-2 h-4 w-4" />
              New Note
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <Suspense fallback={null}>
          <NotesFilters />
          <NotesList />
        </Suspense>
      </div>
    </div>
  );
}
