import type { NoteSearch } from "@/core/search";
import { nativeCommand } from "@/data/native-command";
import { noteResult } from "@/data/note-results";
import { commands } from "@/server/adapters/bindings";

export async function searchNotes(search: NoteSearch) {
  const notes = await nativeCommand(() => commands.searchNotes(search));
  return notes.map(noteResult);
}
