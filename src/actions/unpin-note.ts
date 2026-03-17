"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toNoteId } from "@/lib/id";
import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { noteIdSchema } from "@/server/schemas/note-schemas";
import { NoteService } from "@/server/services/note-service";

export const unpinNote = authedProcedure
  .input(
    Schema.standardSchemaV1(
      Schema.Struct({
        noteId: noteIdSchema,
      }),
    ),
  )
  .handler(async ({ context, input }) => {
    await AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => {
          return svc.unpin(context.userId, toNoteId(input.noteId));
        }),
      ),
    );

    updateTag("notes");
  })
  .actionable();
