import { Effect } from "effect";

import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function getFolders() {
  return run(
    NoteService.pipe(
      Effect.flatMap((svc) => {
        return svc.listFolders();
      }),
    ),
  );
}
