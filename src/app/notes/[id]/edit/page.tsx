import { getNote } from "@/actions/get-note";
import EditNoteForm from "@/components/notes/edit-note-form";

export default async function EditNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;

  const note = await getNote(resolvedParams.id);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Note</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Make changes to your note content below.
          </p>
        </div>

        <EditNoteForm
          initialContent={note?.content}
          noteId={resolvedParams.id}
        />
      </div>
    </div>
  );
}
