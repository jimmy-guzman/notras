import { CancelledError, queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import type { NoteFilters } from "@/core/notes";
import type { NoteSearch } from "@/core/search";
import { getGraph } from "@/data/get-graph";
import { commands } from "@/server/adapters/bindings";
import type { GraphTarget, OpenKind } from "@/server/adapters/bindings";

import { getAppearance } from "./appearance";
import { readConflictStash } from "./conflict-stash";
import { getMentions } from "./get-mentions";
import { getNotes } from "./get-notes";
import { nativeCommand } from "./native-command";
import { getNotesDir } from "./notes-dir";
import { readEmbedded } from "./read-embedded";
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

const list = (filters?: NoteFilters) =>
  queryOptions({
    meta: { what: "could not refresh the note list" },
    queryFn: async () => await getNotes(filters),
    queryKey: [...index, "list", filters ?? null] as const,
  });

/**
 * One walk of the library that every image embed shares. Outside the index
 * prefix, since a note's save cannot change it. No `meta.what`: a failure
 * reaches the embed that asked, which says why in its place.
 */
const images = () =>
  queryOptions({
    queryFn: async () =>
      await nativeCommand(async () => await commands.listImages()),
    queryKey: [...all, "images"] as const,
  });

/**
 * Has the next read of the image list walk the library again. A walk already
 * running would clear the invalidated mark and hand back the old list, and no
 * refetch type restarts a first walk, so it is cancelled silently. Nothing
 * replaces it here: only embeds read the list, and each retries a cancelled
 * read, which starts the next walk.
 */
export function invalidateImages(client: QueryClient): void {
  const { queryKey } = images();

  void client.cancelQueries({ queryKey }, { revert: false, silent: true });
  void client.invalidateQueries({ queryKey, refetchType: "none" });
}

/** Keyed generic to specific: every invalidation is one prefix. */
export const noteQueries = {
  all,
  /**
   * The note or image an embed in `from` shows, or null when its title names
   * neither. Under the index prefix, so a write to any note reads it again.
   */
  embed: (title: string, from: string) =>
    queryOptions({
      queryFn: async ({ client }) =>
        await readEmbedded(
          await client.query(list()),
          title,
          from,
          async () => await client.query(images())
        ),
      queryKey: [...index, "embed", from, title] as const,
      // A read of a list or walk cancelled under it reads again; with
      // no data of its own, nothing else restarts the embed.
      retry: (_failures, error) => error instanceof CancelledError,
      retryDelay: 0,
    }),
  folders: () =>
    queryOptions({
      meta: { what: "could not refresh the folder list" },
      queryFn: async () =>
        await nativeCommand(async () => await commands.listFolders()),
      queryKey: [...index, "folders"] as const,
    }),
  graph: (target: GraphTarget) =>
    queryOptions({
      meta: { what: "could not refresh the graph" },
      queryFn: async () => await getGraph(target),
      queryKey: [...index, "graph", target] as const,
    }),
  index,
  list,
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
      queryFn: async () =>
        await nativeCommand(async () => await commands.listTags()),
      queryKey: [...index, "tags"] as const,
    }),
};

/**
 * What a tab needs before its editor mounts: the file, then any stored review,
 * read once for the tab's life. Keyed by the tab and its kind rather than the
 * path: a move or rename cannot hand the tab another path's read, and a tab
 * that changes kind reads afresh. Outside the notes prefix, so no invalidation
 * re-reads it; the session does that itself.
 */
export const tabOpeningQuery = (id: string, kind: OpenKind, path: string) =>
  queryOptions({
    // Discarded with the session, so reopening the same tab reads afresh.
    gcTime: 0,
    queryFn: async () => {
      const [file, stash] = await Promise.allSettled([
        readSessionFile(kind, path),
        readConflictStash(kind, path),
      ]);

      // The file's failure first, so a missing file is never mistaken for a
      // missing review.
      if (file.status === "rejected") {
        throw file.reason;
      }

      if (stash.status === "rejected") {
        throw stash.reason;
      }

      return { file: file.value, stash: stash.value };
    },
    queryKey: ["tab-opening", id, kind] as const,
    staleTime: "static",
  });

export const appearanceQuery = queryOptions({
  meta: { what: "could not read the appearance" },
  queryFn: getAppearance,
  queryKey: ["appearance"],
});

/** Settings rather than index: no write to a note can move it. */
export const notesDirQuery = queryOptions({
  meta: { what: "could not refresh the notes folder" },
  queryFn: getNotesDir,
  queryKey: ["notes-dir"],
});
