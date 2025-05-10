"use server";

import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function updateNote(id: string, content: string) {
  await db
    .update(note)
    .set({ content, updatedAt: new Date() })
    .where(eq(note.id, id));

  revalidateTag("notes");
}
