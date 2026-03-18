"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { toNoteId } from "@/lib/id";
import { authActionClient } from "@/lib/safe-action";
import { resolvePreset } from "@/lib/utils/reminder-presets";
import { AppRuntime } from "@/server/layer";
import { setReminderSchema } from "@/server/schemas/reminder-schemas";
import { NoteService } from "@/server/services/note-service";

export const setReminder = authActionClient
  .inputSchema(Schema.standardSchemaV1(setReminderSchema))
  .action(async ({ ctx, parsedInput }) => {
    const remindAt = resolvePreset(parsedInput.preset);

    await AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => {
          return svc.setReminder(
            ctx.userId,
            toNoteId(parsedInput.noteId),
            remindAt,
          );
        }),
      ),
    );

    updateTag("notes");

    return { remindAt };
  });
