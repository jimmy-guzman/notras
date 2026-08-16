import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

/** Copy a dragged-in file into `attachments/`; resolves to its relative path. */
export async function attachFile(sourcePath: string) {
  return run(
    NoteService.use((svc) => {
      return svc.attach(sourcePath);
    }),
  );
}

/** Save a pasted clipboard image; resolves to its relative path. */
export async function attachImage(base64Data: string) {
  return run(
    NoteService.use((svc) => {
      return svc.attachImage(base64Data);
    }),
  );
}
