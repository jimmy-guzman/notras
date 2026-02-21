"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import invariant from "tiny-invariant";

import { getSession } from "@/lib/auth";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function unpinNote(noteId: string) {
  const session = await getSession();

  invariant(session, "Unauthorized");

  await db
    .update(note)
    .set({ pinnedAt: null, updatedAt: new Date() })
    .where(eq(note.id, noteId));

  updateTag("notes");
}
