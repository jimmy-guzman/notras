"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorizedServerAction } from "@/lib/authorized";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

const schema = z.object({
  content: z.string().min(1, "Content is required"),
  noteId: z.string().min(1, "Note ID is required"),
});

export async function updateNote(formData: FormData) {
  const { content, noteId } = schema.parse({
    content: formData.get("content"),
    noteId: formData.get("noteId"),
  });

  await authorizedServerAction(async (userId) => {
    await db
      .update(note)
      .set({ content, updatedAt: new Date() })
      .where(and(eq(note.id, noteId), eq(note.userId, userId)));

    updateTag("notes");
  });

  redirect(`/notes/${noteId}`);
}
