import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function deleteNote(path: string) {
  return run(NoteService.use((svc) => svc.delete(path)));
}
