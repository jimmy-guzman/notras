import { Effect } from "effect";

import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

/** Format-on-blur/note-switch; resolves to the formatted content. */
export async function formatNote(path: string) {
  return run(
    NoteService.pipe(
      Effect.flatMap((svc) => {
        return svc.format(path);
      }),
    ),
  );
}
