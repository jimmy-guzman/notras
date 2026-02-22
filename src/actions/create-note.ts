"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorizedServerAction } from "@/lib/authorized";
import { generateNoteId } from "@/lib/id";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

const schema = z.object({
  content: z.string().min(1, "Content is required"),
});

export async function createNote(formData: FormData) {
  const { content } = schema.parse({
    content: formData.get("content"),
  });

  const id = generateNoteId();

  await authorizedServerAction(async (userId) => {
    await db.insert(note).values({
      content,
      createdAt: new Date(),
      id,
      updatedAt: new Date(),
      userId,
    });

    updateTag("notes");
  });

  redirect(`/notes/${id}`);
}
