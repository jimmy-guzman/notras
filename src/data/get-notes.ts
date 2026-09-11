import type { NoteFilters } from "@/core/notes";
import { nativeCommand } from "@/data/native-command";
import { noteResult } from "@/data/note-results";
import { commands } from "@/server/adapters/bindings";

export async function getNotes(filters: NoteFilters = {}) {
  const notes = await nativeCommand(() =>
    commands.listNotes({
      folder: filters.folder ?? null,
      limit: filters.limit ?? null,
      pinnedOnly: filters.pinnedOnly ?? null,
      query: filters.query ?? null,
      sort: filters.sort ?? null,
      tag: filters.tag ?? null,
    })
  );
  return notes.map(noteResult);
}
