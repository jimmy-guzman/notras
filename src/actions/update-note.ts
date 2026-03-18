"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { toNoteId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { updateNoteSchema } from "@/server/schemas/note-schemas";
import { tagsInputSchema } from "@/server/schemas/tag-schemas";
import { NoteService } from "@/server/services/note-service";
import { UserService } from "@/server/services/user-service";

const inputSchema = Schema.Struct({
  content: updateNoteSchema.fields.content,
  noteId: updateNoteSchema.fields.noteId,
  tags: tagsInputSchema,
});

export async function updateNote(formData: FormData) {
  const contentVal = formData.get("content");
  const noteIdVal = formData.get("noteId");
  const tagsVal = formData.get("tags");
  const raw = {
    content: typeof contentVal === "string" ? contentVal : "",
    noteId: typeof noteIdVal === "string" ? noteIdVal : "",
    tags: typeof tagsVal === "string" ? tagsVal : "",
  };

  const input = await Schema.decodePromise(inputSchema)(raw);

  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  const noteId = toNoteId(input.noteId);

  await AppRuntime.runPromise(
    NoteService.pipe(
      Effect.flatMap((svc) => {
        return svc.update(userId, noteId, input.content, [...input.tags]);
      }),
    ),
  );

  updateTag("notes");
  updateTag("tags");
  redirect(`/notes/${noteId}`);
}
