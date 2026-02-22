"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { authorizedServerAction } from "@/lib/authorized";
import { createNoteSchema } from "@/server/schemas/note-schemas";
import { getNoteService } from "@/server/services/note-service";

export async function createNote(formData: FormData) {
  const { content } = createNoteSchema.parse({
    content: formData.get("content"),
  });

  const id = await authorizedServerAction(async (userId) => {
    return getNoteService().create(userId, content);
  });

  updateTag("notes");
  redirect(`/notes/${id}`);
}
