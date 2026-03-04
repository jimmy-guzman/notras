import { notFound } from "next/navigation";

import { getAssets } from "@/actions/get-assets";
import { getNote } from "@/actions/get-note";
import { getNoteTags } from "@/actions/get-note-tags";
import { getTags } from "@/actions/get-tags";
import { updateNote } from "@/actions/update-note";
import { BackLink } from "@/components/back-link";
import { EditPageAssets } from "@/components/notes/assets/edit-page-assets";
import { FormHotkeys } from "@/components/notes/form-hotkeys";
import { TagInput } from "@/components/notes/tag-input";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toNoteId } from "@/lib/id";
import { formatDateTime } from "@/lib/utils/format";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditNotePage({ params }: PageProps) {
  const { id } = await params;
  const noteId = toNoteId(id);
  const [note, existingTags, allTags] = await Promise.all([
    getNote(noteId),
    getNoteTags(noteId),
    getTags(),
  ]);

  if (!note) {
    notFound();
  }

  const assets = await getAssets(id);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <BackLink href={`/notes/${note.id}`} label="note" />
      </div>

      <div className="mb-6 flex items-center gap-3 text-sm text-muted-foreground">
        <span>{formatDateTime(note.createdAt)}</span>
      </div>

      <FormHotkeys action={updateNote}>
        <input name="noteId" type="hidden" value={note.id} />
        <Textarea
          className="text-lg leading-relaxed"
          data-autofocus
          defaultValue={note.content}
          name="content"
          placeholder="write your note content here..."
          rows={10}
        />
        <div className="flex flex-col gap-3 pt-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">tags</span>
            <TagInput
              allTags={allTags.map((t) => t.name)}
              defaultValue={existingTags.map((t) => t.name)}
            />
          </div>
          <div className="flex justify-end">
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
        </div>
      </FormHotkeys>

      <Separator className="my-8" />

      <EditPageAssets assets={assets} noteId={noteId} />
    </div>
  );
}
