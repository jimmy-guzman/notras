import { Schema } from "effect";

import { REMINDER_PRESET_KEYS } from "@/lib/utils/reminder-presets";

const noteIdPattern = /^note_[\da-hjkmnp-tv-z]{26}$/;

export const setReminderSchema = Schema.Struct({
  noteId: Schema.String.pipe(
    Schema.pattern(noteIdPattern, { message: () => "invalid note id" }),
  ),
  preset: Schema.Literal(...REMINDER_PRESET_KEYS),
});
