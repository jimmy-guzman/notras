import { Schema } from "effect";

export const NOTE_ID_PATTERN = /^note_[\da-hjkmnp-tv-z]{26}$/;

export const noteIdSchema = Schema.String.pipe(
  Schema.minLength(1, { message: () => "note id is required" }),
  Schema.pattern(NOTE_ID_PATTERN, {
    message: () => "invalid note id format",
  }),
);

export const createNoteSchema = Schema.Struct({
  content: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Content is required" }),
  ),
});

export const updateNoteSchema = Schema.Struct({
  content: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Content is required" }),
  ),
  noteId: noteIdSchema,
});
