import { Effect } from "effect";

import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

/** Copy a dragged-in file into `attachments/`; resolves to its relative path. */
export async function attachFile(sourcePath: string) {
  return run(
    NoteService.pipe(
      Effect.flatMap((svc) => {
        return svc.attach(sourcePath);
      }),
    ),
  );
}
