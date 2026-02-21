import { format } from "date-fns";
import { PencilIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getNote } from "@/actions/get-note";
import { BackButton } from "@/components/back-button";
import { ArchiveNoteButton } from "@/components/notes/archive-note-button";
import { CopyNoteButton } from "@/components/notes/copy-note-button";
import { PinNoteButton } from "@/components/notes/pin-note-button";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NotePage({ params }: PageProps) {
  const { id } = await params;
  const note = await getNote(id);

  if (!note) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <BackButton />
        <div className="flex items-center gap-2">
          <PinNoteButton noteId={note.id} pinned={Boolean(note.pinnedAt)} />
          <ArchiveNoteButton
            isArchived={note.deletedAt !== null}
            noteId={note.id}
          />
          <CopyNoteButton content={note.content} />
          <Button aria-label="Edit Note" asChild size="icon" variant="ghost">
            <Link href={`/notes/${note.id}/edit`}>
              <PencilIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="text-muted-foreground mb-6 flex items-center gap-3 text-sm">
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
