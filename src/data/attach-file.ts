import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

/** Copy a dragged-in file into `attachments/`; resolves to its relative path. */
export function attachFile(sourcePath: string) {
  return run(NoteService.use((svc) => svc.attach(sourcePath)));
}

/** Save a pasted clipboard image; resolves to its relative path. */
export function attachImage(base64Data: string) {
  return run(NoteService.use((svc) => svc.attachImage(base64Data)));
}
