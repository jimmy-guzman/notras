import { Effect, Schema } from "effect";

import {
  folderNameSchema,
  noteTitleSchema,
} from "@/server/schemas/note-schemas";
import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

interface CreateNoteOptions {
  content?: string;
  folder?: string;
  title?: string;
}

export async function createNote(options?: CreateNoteOptions) {
  const folder =
    options?.folder === undefined
      ? undefined
      : await Schema.decodePromise(folderNameSchema)(options.folder);
  const title =
    options?.title === undefined
      ? undefined
      : await Schema.decodePromise(noteTitleSchema)(options.title);

  return run(
    NoteService.pipe(
      Effect.flatMap((svc) => {
        return svc.create({ content: options?.content, folder, title });
      }),
    ),
  );
}
