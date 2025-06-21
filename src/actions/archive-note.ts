"use server";

import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import invariant from "tiny-invariant";

import { getSession } from "@/lib/auth";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function archiveNote(noteId: string) {
  const session = await getSession();

  invariant(session, "Unauthorized");

  await db
    .update(note)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(note.id, noteId));

  revalidateTag("notes");
  revalidateTag("archived-notes");
}
