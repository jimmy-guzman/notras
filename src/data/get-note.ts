import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function getNote(path: string) {
  return run(
    NoteService.use((svc) => {
      return svc.getByPath(path);
    }),
  );
}
