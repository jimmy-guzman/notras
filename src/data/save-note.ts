import { Effect } from "effect";

import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

/** Autosave path: write the buffer as-is. Formatting happens on blur. */
export async function saveNote(path: string, content: string) {
  return run(
    NoteService.pipe(
      Effect.flatMap((svc) => {
        return svc.write(path, content);
      }),
    ),
  );
}
