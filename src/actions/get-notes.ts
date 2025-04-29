"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import invariant from "tiny-invariant";

import { getSession } from "@/lib/auth";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function getNotes() {
  const session = await getSession();

  invariant(session, "Unauthorized");

  const notes = await db
    .select()
    .from(note)
    .where(and(eq(note.userId, session.user.id), isNull(note.deletedAt)))
    .orderBy(desc(note.pinnedAt), desc(note.createdAt));

  return notes;
}
