import { format } from "date-fns";
import { ArrowLeftIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getNote } from "@/actions/get-note";
import { ArchiveNote } from "@/components/archive-note";
import { CopyNote } from "@/components/copy-note";
import { LinkedNotes } from "@/components/link-notes";
import { PinNote } from "@/components/pin-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KIND_LABELS } from "@/lib/kind";

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
        <Button asChild size="sm" variant="ghost">
          <Link href="/notes">
            <ArrowLeftIcon className="h-4 w-4" /> Back to notes
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <PinNote noteId={note.id} pinned={Boolean(note.pinnedAt)} />
          <ArchiveNote isArchived={note.deletedAt !== null} noteId={note.id} />
          <CopyNote content={note.content} />
        </div>
      </div>

      <div className="text-muted-foreground mb-6 flex items-center gap-3 text-sm">
        <span className="hidden sm:inline">
          {format(note.createdAt, "PPP pp")}
        </span>
        <span className="sm:hidden">
          {format(note.createdAt, "MMM d, h:mm a")}
        </span>
        <Badge className="text-xs capitalize" variant="outline">
          {KIND_LABELS[note.kind ?? "thought"]}
          {note.metadata?.aiKindInferred && (
            <SparklesIcon className="ml-1 inline-block h-3 w-3" />
          )}
        </Badge>
      </div>

      <div className="prose prose-gray dark:prose-invert max-w-none">
        <div className="text-lg leading-relaxed whitespace-pre-wrap">
          {note.content}
        </div>
      </div>

      <div>
        <h3 className="text-muted-foreground mt-8 mb-2 flex items-center gap-2 text-sm font-semibold">
          Linked Notes
        </h3>
        <LinkedNotes noteId={note.id} />
      </div>
    </div>
  );
}
