import type { Kind } from "@/lib/kind";

import { getNotes } from "@/actions/get-notes";
import { EmptyNotesState } from "@/components/empty-note-state";
import { Hero } from "@/components/hero";
import { NoMatchingNotes } from "@/components/no-matching-notes";
import { NotesList } from "@/components/notes-list";
import { SignedOutFallback } from "@/components/signed-out-fallback";
import { SupportNotras } from "@/components/support-notras";
import { UnifiedNoteInput } from "@/components/unified-note-input";
import { getSession } from "@/lib/auth";

interface PageProps {
  searchParams: Promise<{
    kind?: Kind;
    q?: string;
    time?: "month" | "today" | "week";
  }>;
}

export default async function Page({ searchParams }: PageProps) {
  const session = await getSession();

  if (!session?.session) return <SignedOutFallback />;

  const { kind, q: query = "", time } = await searchParams;
  const { hasAnyNotes, notes } = await getNotes({ kind, query, time });

  const hasMatchingNotes = notes.length > 0;
  const noMatches = !hasMatchingNotes && hasAnyNotes;
  const noNotesAtAll = !hasMatchingNotes && !hasAnyNotes;

  return (
    <section className="mt-4 flex flex-col gap-12 p-4">
      {noNotesAtAll && <Hero />}
      <UnifiedNoteInput kind={kind} query={query} />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {hasMatchingNotes && <NotesList notes={notes} query={query} />}
        {noMatches && <NoMatchingNotes />}
        {noNotesAtAll && <EmptyNotesState />}
        <SupportNotras />
      </div>
    </section>
  );
}
