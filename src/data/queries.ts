import { queryOptions } from "@tanstack/react-query";

import type { NoteFilters } from "@/core/notes";
import type { NoteSearch } from "@/core/search";
import { getGraph } from "@/data/get-graph";
import type { GraphTarget, OpenKind } from "@/server/adapters/bindings";

import { readConflictStash } from "./conflict-stash";
import { getMentions } from "./get-mentions";
import { getNotes } from "./get-notes";
import { getTags } from "./get-tags";
import { getNotesDir } from "./notes-dir";
import { readSessionFile } from "./read-session-file";
import { searchNotes } from "./search-notes";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { what?: string };
  }
}

// Not members: reading the object while it is still being built widens it
// to `any`.
const all = ["notes"] as const;
const index = [...all, "index"] as const;

/** Keyed generic to specific: every invalidation is one prefix. */
export const noteQueries = {
  all,
  graph: (target: GraphTarget) =>
    queryOptions({
      meta: { what: "could not refresh the graph" },
      queryFn: async () => await getGraph(target),
      queryKey: [...index, "graph", target] as const,
    }),
  index,
  list: (filters?: NoteFilters) =>
    queryOptions({
      meta: { what: "could not refresh the note list" },
      queryFn: async () => await getNotes(filters),
      queryKey: [...index, "list", filters ?? null] as const,
    }),
  mentions: (path: string) =>
    queryOptions({
      meta: { what: "could not refresh the mentions" },
      queryFn: async () => await getMentions(path),
      queryKey: [...index, "mentions", path] as const,
    }),
  search: (search: NoteSearch) =>
    queryOptions({
      meta: { what: "could not search notes" },
      queryFn: async () => await searchNotes(search),
      queryKey: [...index, "search", search] as const,
    }),
  tags: () =>
    queryOptions({
      meta: { what: "could not refresh the tag list" },
      queryFn: getTags,
      queryKey: [...index, "tags"] as const,
    }),
};

/**
 * What a tab needs before its editor mounts: the file, then any stored review,
 * read once for the tab's life. Keyed by the tab rather than the path, so a
 * move or rename cannot hand the tab another path's read, and outside the
 * notes prefix, so no invalidation re-reads it; the session does that itself.
 */
export const tabOpeningQuery = (id: string, kind: OpenKind, path: string) =>
  queryOptions({
    queryFn: async () => {
      // File first, so a missing file is never mistaken for a missing review.
      const file = await readSessionFile(kind, path);
      return { file, stash: await readConflictStash(kind, path) };
    },
    queryKey: ["tab-opening", id] as const,
    staleTime: "static",
  });

/** Settings rather than index: no write to a note can move it. */
export const notesDirQuery = queryOptions({
  meta: { what: "could not refresh the notes folder" },
  queryFn: getNotesDir,
  queryKey: ["notes-dir"],
});
