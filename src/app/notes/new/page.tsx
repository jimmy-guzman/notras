import { NewNoteForm } from "@/components/notes/new-note-form";

export default function NewNotePage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Note</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a new note below.
          </p>
        </div>
        <NewNoteForm />
      </div>
    </div>
  );
}
