import { Schema } from "effect";

import { noteTitleSchema } from "@/server/schemas/note-schemas";
import { NoteService } from "@/server/services/note-service";

import { run } from "./run";

/**
 * Renames the note's file and syncs a heading or `title:` key it already has
 * (`D32`). The title's charset is unrestricted: the filename is derived from it.
 */
export async function retitleNote(path: string, title: string) {
  const validTitle = await Schema.decodePromise(noteTitleSchema)(title);

  return run(NoteService.use((svc) => svc.retitle(path, validTitle)));
}
