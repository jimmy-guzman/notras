import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

import type { SaveStatus } from "@/components/editor/use-autosave";

import { Editor } from "@/components/editor/editor";
import { SaveIndicator } from "@/components/notes/save-indicator";
import { Titlebar } from "@/components/titlebar";
import { composeNote, parseNote } from "@/core";
import { readExternalNote, writeExternalNote } from "@/data/external-note";
import { registerPendingFlush } from "@/lib/pending-flush";

interface ExternalSearch {
  path: string;
}

export const Route = createFileRoute("/external")({
  component: ExternalPage,
  validateSearch: (search: Record<string, unknown>): ExternalSearch => {
    return { path: typeof search.path === "string" ? search.path : "" };
  },
  loaderDeps: ({ search }) => {
    return { path: search.path };
  },
  loader: ({ deps }) => {
    return readExternalNote(deps.path);
  },
});

function ExternalPage() {
  const { path } = Route.useSearch();
  const file = Route.useLoaderData();

  // Keyed by path because "Open With" navigates this same route rather than
  // opening a window, so save status, the failure flag and any pending write
  // have to end with the file that produced them.
  return <ExternalNote content={file.content} key={path} path={path} />;
}

interface ExternalNoteProps {
  content: string;
  path: string;
}

function ExternalNote({ content, path }: ExternalNoteProps) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  // The editor owns the body; any frontmatter in the file is preserved
  // verbatim around it. Read from the latest loader snapshot at save time,
  // since the loader re-runs for this path without remounting.
  const parsed = parseNote(content);
  const frontmatterRef = useRef(parsed.rawLines);

  useEffect(() => {
    frontmatterRef.current = parsed.rawLines;
  });

  // Tracked so the quit handshake can tell a failed write from a quiet one.
  const saveFailedRef = useRef(false);

  // Serialized on one chain the way `useAutosave` does it: the debounce timer
  // and the unmount flush can both fire while a write is in flight, and two
  // overlapping writes could land out of order -- an older body last.
  const inFlightRef = useRef<Promise<unknown>>(Promise.resolve());

  const writeOnce = async (body: string) => {
    try {
      await writeExternalNote(path, composeNote(frontmatterRef.current, body));
      saveFailedRef.current = false;
      setStatus("saved");
    } catch (error) {
      saveFailedRef.current = true;
      setStatus("failed");
      toast.error(error instanceof Error ? error.message : "save failed");
    }
  };

  const save = useDebouncedCallback(
    (body: string) => {
      const next = inFlightRef.current.then(
        () => {
          return writeOnce(body);
        },
        () => {
          return writeOnce(body);
        },
      );

      inFlightRef.current = next;

      return next;
    },
    800,
    { flushOnExit: true },
  );

  // Quit waits for this the same way it waits for note autosave. Awaiting the
  // chain rather than the flush covers a write that was already running.
  useEffect(() => {
    return registerPendingFlush(async () => {
      void save.flush();
      await inFlightRef.current;

      return !saveFailedRef.current;
    });
  }, [save]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Titlebar>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate font-mono">{path}</span>
          <span className="no-drag ml-auto flex shrink-0 items-center gap-3">
            external file
            <SaveIndicator status={status} />
          </span>
        </div>
      </Titlebar>
      <Editor
        focusOnMount
        initialContent={parsed.body}
        onChange={(body) => {
          setStatus("dirty");
          void save(body);
        }}
      />
    </div>
  );
}
