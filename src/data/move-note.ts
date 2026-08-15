import { Effect, Schema } from "effect";

import { folderNameSchema } from "@/server/schemas/note-schemas";
import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function moveNote(path: string, folder: string) {
  const validFolder = await Schema.decodePromise(folderNameSchema)(folder);

  return run(
    NoteService.pipe(
      Effect.flatMap((svc) => {
        return svc.move(path, validFolder);
      }),
    ),
  );
}
