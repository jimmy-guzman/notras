import { Schema } from "effect";

export const createNoteSchema = Schema.Struct({
  content: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Content is required" }),
  ),
});

export const updateNoteSchema = Schema.Struct({
  content: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Content is required" }),
  ),
  noteId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Note ID is required" }),
  ),
});
