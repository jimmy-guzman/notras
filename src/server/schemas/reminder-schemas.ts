import { Schema } from "effect";

import { REMINDER_PRESET_KEYS } from "@/lib/utils/reminder-presets";
import { NOTE_ID_PATTERN } from "@/server/schemas/note-schemas";

export const setReminderSchema = Schema.Struct({
  noteId: Schema.String.pipe(
    Schema.pattern(NOTE_ID_PATTERN, { message: () => "invalid note id" }),
  ),
  preset: Schema.Literal(...REMINDER_PRESET_KEYS),
});
