import { Effect } from "effect";

import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function setNotePinned(path: string, pinned: boolean) {
  return run(
    NoteService.pipe(
      Effect.flatMap((svc) => {
        return svc.setPinned(path, pinned);
      }),
    ),
  );
}
