"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toNoteId } from "@/lib/id";
import { authActionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/layer";
import { noteIdSchema } from "@/server/schemas/note-schemas";
import { NoteService } from "@/server/services/note-service";

export const deleteNote = authActionClient
  .inputSchema(
    Schema.standardSchemaV1(
      Schema.Struct({
        noteId: noteIdSchema,
      }),
    ),
  )
  .action(async ({ ctx, parsedInput }) => {
    await AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => {
          return svc.delete(ctx.userId, toNoteId(parsedInput.noteId));
        }),
      ),
    );

    updateTag("notes");
    updateTag("tags");
  });
