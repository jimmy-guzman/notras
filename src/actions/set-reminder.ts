"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toNoteId } from "@/lib/id";
import { authedProcedure } from "@/lib/orpc";
import { resolvePreset } from "@/lib/utils/reminder-presets";
import { AppRuntime } from "@/server/layer";
import { setReminderSchema } from "@/server/schemas/reminder-schemas";
import { NoteService } from "@/server/services/note-service";

export const setReminder = authedProcedure
  .input(Schema.standardSchemaV1(setReminderSchema))
  .handler(async ({ context, input }) => {
    const remindAt = resolvePreset(input.preset);

    await AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => {
          return svc.setReminder(
            context.userId,
            toNoteId(input.noteId),
            remindAt,
          );
        }),
      ),
    );

    updateTag("notes");

    return { remindAt };
  })
  .actionable();
