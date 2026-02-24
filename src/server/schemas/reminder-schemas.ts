import { z } from "zod";

const noteIdPattern = /^note_[\da-hjkmnp-tv-z]{26}$/;

const reminderPresets = [
  "in-30-minutes",
  "in-1-hour",
  "in-3-hours",
  "tomorrow-morning",
  "tomorrow-evening",
  "in-3-days",
  "next-week",
] as const;

export const setReminderSchema = z.object({
  noteId: z.string().regex(noteIdPattern, "invalid note id"),
  preset: z.enum(reminderPresets),
});
