import type { NoteSearch } from "@/core/search";
import { NoteService } from "@/server/services/note-service";
import { run } from "./run";

export function searchNotes(search: NoteSearch) {
  return run(NoteService.use((service) => service.search(search)));
}
