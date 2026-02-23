import { format } from "date-fns";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAssets } from "@/actions/get-assets";
import { getNote } from "@/actions/get-note";
import { updateNote } from "@/actions/update-note";
import { EditPageAssets } from "@/components/notes/assets/edit-page-assets";
import { FormHotkeys } from "@/components/notes/form-hotkeys";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toNoteId } from "@/lib/id";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditNotePage({ params }: PageProps) {
  const { id } = await params;
  const noteId = toNoteId(id);
  const note = await getNote(noteId);

  if (!note) {
    notFound();
  }

  const assets = await getAssets(id);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/notes/${note.id}`}>
            <ArrowLeftIcon className="h-4 w-4" /> note
          </Link>
        </Button>
      </div>

      <div className="mb-6 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="hidden sm:inline">
          {format(note.createdAt, "PPP pp")}
        </span>
        <span className="sm:hidden">
          {format(note.createdAt, "MMM d, h:mm a")}
        </span>
      </div>

      <FormHotkeys action={updateNote} cancelHref={`/notes/${note.id}`}>
        <input name="noteId" type="hidden" value={note.id} />
        <Textarea
          className="text-lg leading-relaxed"
          data-autofocus
          defaultValue={note.content}
          name="content"
          placeholder="write your note content here..."
          rows={10}
        />
        <div className="flex justify-end gap-2 pt-4">
          <Button asChild variant="outline">
            <Link href={`/notes/${note.id}`}>cancel</Link>
          </Button>
          <Button type="submit">
            <span className="flex items-center gap-2 text-sm">
              save
              <span className="hidden gap-0.5 sm:inline-flex">
                <Kbd>⌘</Kbd>
                <Kbd>⏎</Kbd>
              </span>
            </span>
          </Button>
        </div>
      </FormHotkeys>

      <Separator className="my-8" />

      <EditPageAssets assets={assets} noteId={noteId} />
    </div>
  );
}
