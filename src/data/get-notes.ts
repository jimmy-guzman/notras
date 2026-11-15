import type { NoteFilters } from "@/core/notes";
import { commands } from "@/server/adapters/bindings";

import { nativeCommand } from "./native-command";

export async function getNotes(filters: NoteFilters = {}) {
  return await nativeCommand(async () => await commands.listNotes(filters));
}
