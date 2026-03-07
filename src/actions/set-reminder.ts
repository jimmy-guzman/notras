"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { toNoteId } from "@/lib/id";
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
          return svc.setReminder(userId, toNoteId(data.noteId), remindAt);
        }),
      ),
    );
  });

  updateTag("notes");

  return { remindAt };
}
