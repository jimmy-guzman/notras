import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

/** Autosave path: write the buffer as-is. Formatting happens on blur. */
export function saveNote(path: string, content: string) {
  return run(NoteService.use((svc) => svc.write(path, content)));
}
