import { Schema } from "effect";

import { noteTitleSchema } from "@/server/schemas/note-schemas";
import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function renameNote(path: string, title: string) {
  const validTitle = await Schema.decodePromise(noteTitleSchema)(title);

  return run(
    NoteService.use((svc) => {
      return svc.rename(path, validTitle);
    }),
  );
}
