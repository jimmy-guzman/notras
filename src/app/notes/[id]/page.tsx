import { format } from "date-fns";
import { notFound } from "next/navigation";

import { getNote } from "@/actions/get-note";
import { NoteActions } from "@/components/notes/note-actions";
import { toNoteId } from "@/lib/id";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NotePage({ params }: PageProps) {
  const { id } = await params;
  const noteId = toNoteId(id);
  const note = await getNote(noteId);

  if (!note) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <NoteActions
          content={note.content}
          noteId={toNoteId(note.id)}
          pinned={Boolean(note.pinnedAt)}
        />
      </div>

      <div className="mb-6 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="hidden sm:inline">
          {format(note.createdAt, "PPP pp")}
        </span>
        <span className="sm:hidden">
          {format(note.createdAt, "MMM d, h:mm a")}
        </span>
      </div>

      <div className="prose prose-gray dark:prose-invert mb-12 max-w-none">
        <div className="text-lg leading-relaxed whitespace-pre-wrap">
          {note.content}
        </div>
      </div>
    </div>
  );
}
