"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { AppRuntime } from "@/server/layer";
import { createNoteSchema } from "@/server/schemas/note-schemas";
import { tagsInputSchema } from "@/server/schemas/tag-schemas";
import { NoteService } from "@/server/services/note-service";
import { UserService } from "@/server/services/user-service";

const inputSchema = Schema.Struct({
  content: createNoteSchema.fields.content,
  tags: Schema.optionalWith(tagsInputSchema, { default: () => [] }),
});

export async function createNote(formData: FormData) {
  const contentVal = formData.get("content");
  const tagsVal = formData.get("tags");
  const raw = {
    content: typeof contentVal === "string" ? contentVal : "",
    tags: typeof tagsVal === "string" ? tagsVal : "",
  };

  const input = await Schema.decodePromise(inputSchema)(raw);

  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  const id = await AppRuntime.runPromise(
    NoteService.pipe(
      Effect.flatMap((svc) =>
        svc.create(userId, input.content, [...input.tags]),
      ),
    ),
  );

  updateTag("notes");
  updateTag("tags");
  redirect(`/notes/${id}`);
}
