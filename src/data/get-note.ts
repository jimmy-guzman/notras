import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export function getNote(path: string) {
  return run(NoteService.use((svc) => svc.getByPath(path)));
}
