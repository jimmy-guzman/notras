"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { authorizedServerAction } from "@/lib/authorized";
import { toNoteId } from "@/lib/id";
import { updateNoteSchema } from "@/server/schemas/note-schemas";
import { getNoteService } from "@/server/services/note-service";

export async function updateNote(formData: FormData) {
  const parsed = updateNoteSchema.parse({
    content: formData.get("content"),
    noteId: formData.get("noteId"),
  });

  const noteId = toNoteId(parsed.noteId);
  const { content } = parsed;

  await authorizedServerAction(async (userId) => {
    await getNoteService().update(userId, noteId, content);
  });

  updateTag("notes");
  redirect(`/notes/${noteId}`);
}
