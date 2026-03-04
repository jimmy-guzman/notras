"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { serverAction } from "@/lib/authorized";
import { toNoteId } from "@/lib/id";
import { updateNoteSchema } from "@/server/schemas/note-schemas";
import { tagsInputSchema } from "@/server/schemas/tag-schemas";
import { getNoteService } from "@/server/services/note-service";

export async function updateNote(formData: FormData) {
  const parsed = updateNoteSchema.parse({
    content: formData.get("content"),
    noteId: formData.get("noteId"),
  });

  const noteId = toNoteId(parsed.noteId);
  const { content } = parsed;
  const tags = tagsInputSchema.parse(formData.get("tags") ?? "");

  await serverAction(async (userId) => {
    await getNoteService().update(userId, noteId, content, tags);
  });

  updateTag("notes");
  updateTag("tags");
  redirect(`/notes/${noteId}`);
}
