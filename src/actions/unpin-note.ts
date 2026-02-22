"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import invariant from "tiny-invariant";

import type { NoteId } from "@/lib/id";

import { getSession } from "@/lib/auth";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function unpinNote(noteId: NoteId) {
  const session = await getSession();

  invariant(session, "Unauthorized");

  await db
    .update(note)
    .set({ pinnedAt: null, updatedAt: new Date() })
    .where(and(eq(note.id, noteId), eq(note.userId, session.user.id)));

  updateTag("notes");
}
