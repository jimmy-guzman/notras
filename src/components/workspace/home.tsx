import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

import { Chord } from "@/components/chord";
import { Mark } from "@/components/mark";
import { NoteLabel } from "@/components/notes/note-label";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { indexStatusQuery } from "@/data/index-status";
import { noteQueries, notesDirQuery } from "@/data/queries";
import { recentNotes } from "@/lib/recent-notes";
import { reasonOf } from "@/lib/ui/failure";
import { openSearchResult } from "@/lib/ui/find";
import { useHotkeys } from "@/lib/ui/shortcuts";

/** ⌘1 to ⌘5 open the rows, the way they select tabs once one is open. */
const ROW_CHORDS = ["Mod+1", "Mod+2", "Mod+3", "Mod+4", "Mod+5"] as const;

function RecentNotes({ notesDir }: { notesDir: string }) {
  const library = useQuery(noteQueries.list());
  const status = useQuery(indexStatusQuery);

  const notes = library.isSuccess ? recentNotes(notesDir, library.data) : [];

  const rows = ROW_CHORDS.flatMap((hotkey, index) => {
    const note = notes[index];

    return note === undefined ? [] : [{ hotkey, note }];
  });

  useHotkeys(
    rows.map(({ hotkey, note }) => ({
      callback: () => {
        openSearchResult(note, false);
      },
      hotkey,
    }))
  );

  if (library.isPending) {
    return status.data?.state === "scanning" ? (
      <output className="text-muted-foreground block px-2 text-xs">
        indexing notes...
      </output>
    ) : null;
  }

  if (library.isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>could not load recent notes</EmptyTitle>
          <EmptyDescription>{reasonOf(library.error)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            onClick={() => {
              void library.refetch();
            }}
            size="sm"
            variant="outline"
          >
            retry
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <>
      <p className="text-muted-foreground flex h-8 items-center px-2 text-xs tracking-wider uppercase">
        recent
      </p>
      <ul aria-label="recent notes" className="flex flex-col gap-0.5">
        {rows.map(({ hotkey, note }) => (
          <li key={note.path}>
            <button
              className="hover:bg-muted/50 focus-visible:inset-ring-ring flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm outline-none focus-visible:inset-ring-2"
              onClick={() => {
                openSearchResult(note, false);
              }}
              type="button"
            >
              <NoteLabel note={note} />
              <span className="ml-auto">
                <Chord hotkey={hotkey} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The screen with no tab open: the lockup, then the last five notes visited,
 * so picking up where you left off is one key away.
 */
export function Home({
  onNew,
  onSearch,
}: {
  onNew: () => void;
  onSearch: () => void;
}) {
  const { data: notesDir } = useSuspenseQuery(notesDirQuery);

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="flex w-full max-w-md flex-col">
        <div className="flex items-center gap-7">
          <div className="shrink-0">
            <Mark blinking size={112} />
          </div>
          <div className="flex flex-col items-start gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="tracking-wordmark font-sans text-5xl leading-none font-semibold">
                notras
              </h1>
              <p className="text-muted-foreground leading-tagline text-xl tracking-tight">
                write another note
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={onNew}>
                new note <Chord hotkey="Mod+N" />
              </Button>
              <Button onClick={onSearch} variant="secondary">
                search <Chord hotkey="Mod+P" />
              </Button>
            </div>
          </div>
        </div>
        {/* Reserves the rows' height, so the lockup holds still while they load. */}
        <div className="mt-8 min-h-48">
          <RecentNotes notesDir={notesDir} />
        </div>
      </div>
    </div>
  );
}
