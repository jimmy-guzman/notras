import { format } from "date-fns";
import { BellIcon } from "lucide-react";
import { notFound } from "next/navigation";

import { getAssets } from "@/actions/get-assets";
import { getNote } from "@/actions/get-note";
import { AssetList } from "@/components/notes/assets/asset-list";
import { PdfList } from "@/components/notes/assets/pdf-list";
import { NoteActions } from "@/components/notes/note-actions";
import { toNoteId } from "@/lib/id";
import { partitionAssets } from "@/lib/utils/assets";

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

  const assets = await getAssets(id);
  const { images, pdfs } = partitionAssets(assets);
  const hasAttachments = images.length > 0 || pdfs.length > 0;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <NoteActions
          content={note.content}
          noteId={toNoteId(note.id)}
          pinned={Boolean(note.pinnedAt)}
          remindAt={note.remindAt ?? null}
        />
      </div>

      <div className="mb-6 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="hidden sm:inline">
          {format(note.createdAt, "PPP pp")}
        </span>
        <span className="sm:hidden">
          {format(note.createdAt, "MMM d, h:mm a")}
        </span>
        {note.remindAt && (
          <span className="flex items-center gap-1 text-xs">
            <BellIcon className="h-3 w-3" />
            {format(note.remindAt, "MMM d, h:mm a").toLowerCase()}
          </span>
        )}
      </div>

      <div className="prose prose-gray dark:prose-invert mb-12 max-w-none">
        <div className="text-lg leading-relaxed whitespace-pre-wrap">
          {note.content}
        </div>
      </div>

      {hasAttachments && (
        <div className="space-y-6 border-t pt-8">
          {images.length > 0 && (
            <div>
              <h2 className="mb-4 text-sm font-medium text-muted-foreground">
                images
              </h2>
              <AssetList assets={images} mode="view" noteId={noteId} />
            </div>
          )}

          {pdfs.length > 0 && (
            <div>
              <h2 className="mb-4 text-sm font-medium text-muted-foreground">
                documents
              </h2>
              <PdfList mode="view" noteId={noteId} pdfs={pdfs} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
