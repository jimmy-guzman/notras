import { Effect, Schema } from "effect";

import {
  folderNameSchema,
  noteFilenameSchema,
} from "@/server/schemas/note-schemas";
import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

interface CreateNoteOptions {
  content?: string;
  filename?: string;
  folder?: string;
}

export async function createNote(options?: CreateNoteOptions) {
  const folder =
    options?.folder === undefined
      ? undefined
      : await Schema.decodePromise(folderNameSchema)(options.folder);
  const filename =
    options?.filename === undefined
      ? undefined
      : await Schema.decodePromise(noteFilenameSchema)(options.filename);

  return run(
    NoteService.pipe(
      Effect.flatMap((svc) =>
        svc.create({ content: options?.content, filename, folder })
      )
    )
  );
}
