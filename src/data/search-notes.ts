import type { NoteSearch } from "@/core/search";
import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

export async function searchNotes(search: NoteSearch) {
  return await nativeCommand(async () => await commands.searchNotes(search));
}
