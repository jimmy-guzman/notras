import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

import { Editor } from "@/components/editor/editor";
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
  const [status, setStatus] = useState<"dirty" | "saved">("saved");
  // The editor owns the body; any frontmatter in the file is preserved
  // verbatim around it. Read from the latest loader snapshot at save time --
  // this component is not keyed by path, so a mount-time copy would write one
  // file's frontmatter onto the next.
  const parsed = parseNote(file.content);
  const frontmatterRef = useRef(parsed.rawLines);

  useEffect(() => {
    frontmatterRef.current = parsed.rawLines;
  });

  // Tracked so the quit handshake can tell a failed write from a quiet one.
  const saveFailedRef = useRef(false);

  const save = useDebouncedCallback(
    async (body: string) => {
      try {
        await writeExternalNote(
          path,
          composeNote(frontmatterRef.current, body),
        );
        saveFailedRef.current = false;
        setStatus("saved");
      } catch (error) {
        saveFailedRef.current = true;
        toast.error(error instanceof Error ? error.message : "save failed");
      }
    },
    800,
    { flushOnExit: true },
  );

  // Quit waits for this the same way it waits for note autosave.
  useEffect(() => {
    return registerPendingFlush(async () => {
      await save.flush();

      return !saveFailedRef.current;
    });
  }, [save]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Titlebar>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate font-mono">{path}</span>
          <span className="ml-auto shrink-0">
            external file · {status === "saved" ? "saved" : "unsaved"}
          </span>
        </div>
      </Titlebar>
      <Editor
        focusOnMount
        initialContent={parsed.body}
        key={path}
        onChange={(body) => {
          setStatus("dirty");
          void save(body);
        }}
      />
    </div>
  );
}
