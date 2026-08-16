import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { createNote } from "@/data/create-note";
import { getNotes } from "@/data/get-notes";

export const Route = createFileRoute("/")({
  component: EmptyState,
  loader: async () => {
    // Launch straight into the last-edited note; the empty state only shows
    // for a brand-new library.
    const [latest] = await getNotes({ limit: 1, sort: "updated" });

    if (latest !== undefined) {
      return redirect({
        params: { _splat: latest.path },
        to: "/notes/$",
      });
    }

    return undefined;
  },
});

function EmptyState() {
  const navigate = useNavigate();

  const newNote = () => {
    void createNote()
      .then((path) => {
        return navigate({ params: { _splat: path }, to: "/notes/$" });
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "could not create note",
        );
      });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-5xl font-bold tracking-tight">notras</h1>
        <p className="text-muted-foreground">just write, otra vez.</p>
      </div>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <Button onClick={newNote} variant="secondary">
          new note <Kbd>⌘n</Kbd>
        </Button>
        <span>
          or search with <Kbd>⌘k</Kbd>
        </span>
      </div>
    </div>
  );
}
