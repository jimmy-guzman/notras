import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export function getTags() {
  return run(NoteService.use((svc) => svc.listTags()));
}
