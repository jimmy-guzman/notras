import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function getFolders() {
  return run(NoteService.use((svc) => svc.listFolders()));
}
