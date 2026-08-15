import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

import { Editor } from "@/components/editor/editor";
import { readExternalNote, writeExternalNote } from "@/data/external-note";

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

  const save = useDebouncedCallback(async (content: string) => {
    try {
      await writeExternalNote(path, content);
      setStatus("saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "save failed");
    }
  }, 800);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-6 pt-1 pb-2 text-xs text-muted-foreground">
        <span className="truncate font-mono">{path}</span>
        <span className="ml-auto shrink-0">
          external file · {status === "saved" ? "saved" : "unsaved"}
        </span>
      </div>
      <Editor
        focusOnMount
        initialContent={file.content}
        key={path}
        onChange={(content) => {
          setStatus("dirty");
          void save(content);
        }}
      />
    </div>
  );
}
