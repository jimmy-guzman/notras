import type { NoteSearch } from "@/core/search";
import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";
import { noteResult } from "./note-results";

export async function searchNotes(search: NoteSearch) {
  const notes = await nativeCommand(
    async () => await commands.searchNotes(search)
  );

  return notes.map(noteResult);
}
