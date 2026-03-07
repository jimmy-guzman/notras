"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { resolvePreset } from "@/lib/utils/reminder-presets";
import { AppRuntime } from "@/server/layer";
import { setReminderSchema } from "@/server/schemas/reminder-schemas";
import { NoteService } from "@/server/services/note-service";

export async function setReminder(formData: FormData) {
  const data = Schema.decodeUnknownSync(setReminderSchema)({
    noteId: formData.get("noteId"),
    preset: formData.get("preset"),
  });

  const remindAt = resolvePreset(data.preset);

  await serverAction(async (userId) => {
    await AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => {
          return svc.setReminder(userId, data.noteId as NoteId, remindAt);
        }),
      ),
    );
  });

  updateTag("notes");

  return { remindAt };
}
