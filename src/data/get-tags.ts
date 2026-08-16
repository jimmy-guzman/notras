import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function getTags() {
  return run(
    NoteService.use((svc) => {
      return svc.listTags();
    }),
  );
}
