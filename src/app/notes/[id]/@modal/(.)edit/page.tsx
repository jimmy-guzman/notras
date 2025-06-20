import { getNote } from "@/actions/get-note";
import { EditNoteDialog } from "@/components/notes/edit-note-dialog";
import EditNoteForm from "@/components/notes/edit-note-form";

export default async function EditNoteModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;

  const note = await getNote(resolvedParams.id);

  return (
    <EditNoteDialog>
      <EditNoteForm initialContent={note?.content} noteId={resolvedParams.id} />
    </EditNoteDialog>
  );
}
