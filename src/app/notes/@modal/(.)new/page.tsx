import { NewNoteDialog } from "@/components/notes/new-note-dialog";
import { NewNoteForm } from "@/components/notes/new-note-form";

export default function NewNoteModal() {
  return (
    <NewNoteDialog>
      <NewNoteForm />
    </NewNoteDialog>
  );
}
