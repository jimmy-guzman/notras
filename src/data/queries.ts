import { queryOptions } from "@tanstack/react-query";

import type { NoteFilters } from "@/core/notes";
import type { NoteSearch } from "@/core/search";
import { getGraph } from "@/data/get-graph";
import type { Tab } from "@/lib/tabs/tab";
import type { GraphTarget } from "@/server/adapters/bindings";
import { readExternalNote } from "./external-note";
import { getMentions } from "./get-mentions";
import { getNote } from "./get-note";
import { getNotes } from "./get-notes";
import { getTags } from "./get-tags";
import { getNotesDir } from "./notes-dir";
import { searchNotes } from "./search-notes";

// Not members: reading the object while it is still being built widens it
// to `any`.
const all = ["notes"] as const;
const index = [...all, "index"] as const;
const fileKey = (kind: Tab["kind"], path: string) =>
  [...all, "file", kind, path] as const;

/** One tab's file as of the last read. An external file reports no pin and no tags (`D54`). */
export interface SessionFile {
  content: string;
  pinned: boolean;
  tags: string[];
  updatedAt: Date;
}

async function readTab(kind: Tab["kind"], path: string): Promise<SessionFile> {
  if (kind === "external") {
    const file = await readExternalNote(path);

    return {
      content: file.content,
      pinned: false,
      tags: [],
      updatedAt: file.updatedAt,
    };
  }

  const note = await getNote(path);

  return {
    content: note.content,
    pinned: note.pinned,
    tags: note.tags,
    updatedAt: note.updatedAt,
  };
}

/** Keyed generic to specific: every invalidation is one prefix. */
export const noteQueries = {
  all,
  file: (kind: Tab["kind"], path: string) =>
    queryOptions({
      queryFn: () => readTab(kind, path),
      queryKey: fileKey(kind, path),
      // No payload names a path outside the notes dir, so focus is the signal.
      // "always" and not `true`: staleTime is infinite, so a stale check the
      // query can never fail would refetch on nothing.
      refetchOnWindowFocus: kind === "external" ? "always" : false,
    }),
  fileKey,
  graph: (target: GraphTarget) =>
    queryOptions({
      meta: { what: "could not refresh the graph" },
      queryFn: () => getGraph(target),
      queryKey: [...index, "graph", target] as const,
    }),
  index,
  list: (filters?: NoteFilters) =>
    queryOptions({
      meta: { what: "could not refresh the note list" },
      queryFn: () => getNotes(filters),
      queryKey: [...index, "list", filters ?? null] as const,
    }),
  mentions: (path: string) =>
    queryOptions({
      meta: { what: "could not refresh the mentions" },
      queryFn: () => getMentions(path),
      queryKey: [...index, "mentions", path] as const,
    }),
  search: (search: NoteSearch) =>
    queryOptions({
      meta: { what: "could not search notes" },
      queryFn: () => searchNotes(search),
      queryKey: [...index, "search", search] as const,
    }),
  tags: () =>
    queryOptions({
      meta: { what: "could not refresh the tag list" },
      queryFn: getTags,
      queryKey: [...index, "tags"] as const,
    }),
};

/** Settings rather than index: no write to a note can move it. */
export const notesDirQuery = queryOptions({
  meta: { what: "could not refresh the notes folder" },
  queryFn: getNotesDir,
  queryKey: ["notes-dir"] as const,
});
