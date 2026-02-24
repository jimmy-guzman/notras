import { z } from "zod";

import { REMINDER_PRESET_KEYS } from "@/lib/utils/reminder-presets";

const noteIdPattern = /^note_[\da-hjkmnp-tv-z]{26}$/;

export const setReminderSchema = z.object({
  noteId: z.string().regex(noteIdPattern, "invalid note id"),
  preset: z.enum(REMINDER_PRESET_KEYS),
});
