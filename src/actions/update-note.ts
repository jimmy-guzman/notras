"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { serverAction } from "@/lib/authorized";
import { toNoteId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { updateNoteSchema } from "@/server/schemas/note-schemas";
import { tagsInputSchema } from "@/server/schemas/tag-schemas";
import { NoteService } from "@/server/services/note-service";

export async function updateNote(formData: FormData) {
  const parsed = Schema.decodeUnknownSync(updateNoteSchema)({
    content: formData.get("content"),
    noteId: formData.get("noteId"),
  });

  const noteId = toNoteId(parsed.noteId);
  const { content } = parsed;
  const tags = Schema.decodeUnknownSync(tagsInputSchema)(
    formData.get("tags") ?? "",
  );

  await serverAction(async (userId) => {
    await AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => svc.update(userId, noteId, content, [...tags])),
      ),
    );
  });

  updateTag("notes");
  updateTag("tags");
  redirect(`/notes/${noteId}`);
}
