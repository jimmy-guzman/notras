"use server";

import { Effect, Schema } from "effect";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { AppRuntime } from "@/server/layer";
import { createNoteSchema } from "@/server/schemas/note-schemas";
import { tagsInputSchema } from "@/server/schemas/tag-schemas";
import { NoteService } from "@/server/services/note-service";
import { UserService } from "@/server/services/user-service";

export async function createNote(formData: FormData) {
  const { content } = Schema.decodeUnknownSync(createNoteSchema)({
    content: formData.get("content"),
  });

  const tags = Schema.decodeUnknownSync(tagsInputSchema)(
    formData.get("tags") ?? "",
  );

  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  const id = await AppRuntime.runPromise(
    NoteService.pipe(
      Effect.flatMap((svc) => svc.create(userId, content, [...tags])),
    ),
  );

  updateTag("notes");
  updateTag("tags");
  revalidatePath("/");
  redirect(`/notes/${id}`);
}
