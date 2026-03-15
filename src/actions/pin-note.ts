"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toNoteId } from "@/lib/id";
import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { NOTE_ID_PATTERN } from "@/server/schemas/note-schemas";
import { NoteService } from "@/server/services/note-service";

export const pinNote = authedProcedure
  .input(
    Schema.standardSchemaV1(
      Schema.Struct({
        noteId: Schema.String.pipe(
          Schema.pattern(NOTE_ID_PATTERN, {
            message: () => "invalid note id format",
          }),
        ),
      }),
    ),
  )
  .handler(async ({ context, input }) => {
    await AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) =>
          svc.pin(context.userId, toNoteId(input.noteId)),
        ),
      ),
    );

    updateTag("notes");
  })
  .actionable();
