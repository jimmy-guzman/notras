import type { NoteFilters } from "@/core/notes";
import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";
import { noteResult } from "./note-results";

export async function getNotes(filters: NoteFilters = {}) {
  const notes = await nativeCommand(
    async () =>
      await commands.listNotes({
        folder: filters.folder ?? null,
        includePreview: filters.includePreview ?? null,
        limit: filters.limit ?? null,
        pinnedOnly: filters.pinnedOnly ?? null,
        query: filters.query ?? null,
        tag: filters.tag ?? null,
      })
  );

  return notes.map(noteResult);
}
