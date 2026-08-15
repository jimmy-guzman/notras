"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { resolvePreset, toNoteId } from "@/core";
import { authActionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/runtime";
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
