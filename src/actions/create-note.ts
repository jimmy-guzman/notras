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

  const id = await AppRuntime.runPromise(
    Effect.gen(function* () {
      const userId = yield* UserService.pipe(
        Effect.flatMap((svc) => svc.getDeviceUserId()),
      );

      return yield* NoteService.pipe(
        Effect.flatMap((svc) => svc.create(userId, content, [...tags])),
      );
    }),
  );

  updateTag("notes");
  updateTag("tags");
  revalidatePath("/");
  redirect(`/notes/${id}`);
}
