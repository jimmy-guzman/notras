import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function setNotePinned(path: string, pinned: boolean) {
  return run(NoteService.use((svc) => svc.setPinned(path, pinned)));
}
