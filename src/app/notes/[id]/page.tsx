import { BellIcon } from "lucide-react";
import { notFound } from "next/navigation";

import { getAssets } from "@/actions/get-assets";
import { getLinks } from "@/actions/get-links";
import { getNote } from "@/actions/get-note";
import { getNoteTags } from "@/actions/get-note-tags";
import { getPreferences } from "@/actions/get-preferences";
import { AssetList } from "@/components/notes/assets/asset-list";
import { PdfList } from "@/components/notes/assets/pdf-list";
import { MarkdownContent } from "@/components/notes/markdown-content";
import { NoteActions } from "@/components/notes/note-actions";
import { NoteLinks } from "@/components/notes/note-links";
import { NoteTags } from "@/components/notes/note-tags";
import { toNoteId } from "@/lib/id";
import { partitionAssets } from "@/lib/utils/assets";
import { formatDateTime } from "@/lib/utils/format";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NotePage({ params }: PageProps) {
  const { id } = await params;
  const noteId = toNoteId(id);
  const [note, preferences, tags] = await Promise.all([
    getNote(noteId),
    getPreferences(),
    getNoteTags(noteId),
  ]);

  if (!note) {
    notFound();
  }

  const assets = await getAssets(id);
  const links = await getLinks(noteId);
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
        <span>{formatDateTime(note.createdAt)}</span>
        {note.remindAt && (
          <span className="flex items-center gap-1 text-xs">
            <BellIcon className="h-3 w-3" />
            {formatDateTime(note.remindAt)}
          </span>
        )}
      </div>

      {tags.length > 0 && (
        <div className="mb-6">
          <NoteTags maxVisible={Infinity} tags={tags} />
        </div>
      )}

      {preferences.markdownPreview ? (
        <div className="prose mb-12 max-w-none prose-stone dark:prose-invert">
          <MarkdownContent
            content={note.content}
            syntaxHighlighting={preferences.syntaxHighlighting}
          />
        </div>
      ) : (
        <div className="prose mb-12 max-w-none prose-stone dark:prose-invert">
          <div className="text-lg leading-relaxed whitespace-pre-wrap">
            {note.content}
          </div>
        </div>
      )}

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

      {links.length > 0 && (
        <div className="mt-12">
          <NoteLinks links={links} />
        </div>
      )}
    </div>
  );
}
