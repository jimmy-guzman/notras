import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export function getLinks() {
  return run(NoteService.use((svc) => svc.listLinks()));
}
