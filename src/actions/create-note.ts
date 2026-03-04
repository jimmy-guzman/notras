"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { serverAction } from "@/lib/authorized";
import { createNoteSchema } from "@/server/schemas/note-schemas";
import { tagsInputSchema } from "@/server/schemas/tag-schemas";
import { getNoteService } from "@/server/services/note-service";

export async function createNote(formData: FormData) {
  const { content } = createNoteSchema.parse({
    content: formData.get("content"),
  });

  const tags = tagsInputSchema.parse(formData.get("tags") ?? "");

  const id = await serverAction(async (userId) => {
    return getNoteService().create(userId, content, tags);
  });

  updateTag("notes");
  updateTag("tags");
  revalidatePath("/");
  redirect(`/notes/${id}`);
}
