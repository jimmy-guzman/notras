import { Schema } from "effect";

import { folderNameSchema } from "@/server/schemas/note-schemas";
import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

export async function moveNote(path: string, folder: string) {
  const validFolder = await Schema.decodePromise(folderNameSchema)(folder);

  return run(NoteService.use((svc) => svc.move(path, validFolder)));
}
