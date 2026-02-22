"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import invariant from "tiny-invariant";

import { getSession } from "@/lib/auth";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function deleteNote(noteId: string) {
  const session = await getSession();

  invariant(session, "Unauthorized");

  await db
    .delete(note)
    .where(and(eq(note.id, noteId), eq(note.userId, session.user.id)));

  updateTag("notes");
}
