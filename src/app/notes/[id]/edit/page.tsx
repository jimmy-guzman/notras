import { format } from "date-fns";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getNote } from "@/actions/get-note";
import { updateNote } from "@/actions/update-note";
import { FormHotkeys } from "@/components/notes/form-hotkeys";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditNotePage({ params }: PageProps) {
  const { id } = await params;
  const note = await getNote(id);

  if (!note) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/notes/${note.id}`}>
            <ArrowLeftIcon className="h-4 w-4" /> Note
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
          placeholder="Write your note content here..."
          rows={10}
        />
        <div className="flex justify-end gap-2 pt-4">
          <Button asChild variant="outline">
            <Link href={`/notes/${note.id}`}>Cancel</Link>
          </Button>
          <Button type="submit">
            <span className="flex items-center gap-2 text-sm">
              Save
              <span className="hidden gap-0.5 sm:inline-flex">
                <Kbd>⌘</Kbd>
                <Kbd>⏎</Kbd>
              </span>
            </span>
          </Button>
        </div>
      </FormHotkeys>
    </div>
  );
}
