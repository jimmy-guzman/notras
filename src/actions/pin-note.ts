"use server";

import { eq } from "drizzle-orm";
import invariant from "tiny-invariant";

import { getSession } from "@/lib/auth";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function pinNote(noteId: string) {
  const session = await getSession();

  invariant(session, "Unauthorized");

  await db
    .update(note)
    .set({ pinnedAt: new Date(), updatedAt: new Date() })
    .where(eq(note.id, noteId));
}
