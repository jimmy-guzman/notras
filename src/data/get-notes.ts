import type { NoteFilters } from "@/core";

import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export function getNotes(filters?: NoteFilters) {
  return run(NoteService.use((svc) => svc.list(filters)));
}
