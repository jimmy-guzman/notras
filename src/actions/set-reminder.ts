"use server";

import { updateTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { resolvePreset } from "@/lib/utils/reminder-presets";
import { setReminderSchema } from "@/server/schemas/reminder-schemas";
import { getNoteService } from "@/server/services/note-service";

export async function setReminder(formData: FormData) {
  const data = setReminderSchema.parse({
    noteId: formData.get("noteId"),
    preset: formData.get("preset"),
  });

  const remindAt = resolvePreset(data.preset);

  await serverAction(async (userId) => {
    await getNoteService().setReminder(userId, data.noteId as NoteId, remindAt);
  });

  updateTag("notes");

  return { remindAt };
}
