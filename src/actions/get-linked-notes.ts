"use server";

import { and, desc, eq } from "drizzle-orm";

import { authorizedServerAction } from "@/lib/authorized";
import { db } from "@/server/db";
import { noteLink } from "@/server/db/schemas/note-link";
import { note } from "@/server/db/schemas/notes";

const DEFAULT_MAX_NOTES = 3;

export async function getLinkedNotes(
  noteId: string,
  limit = DEFAULT_MAX_NOTES,
) {
  return authorizedServerAction(async (userId) => {
    return db
      .select({
        confidence: noteLink.confidence,
        content: note.content,
        id: note.id,
        reason: noteLink.reason,
      })
      .from(noteLink)
      .innerJoin(note, eq(note.id, noteLink.toNoteId))
      .where(and(eq(note.userId, userId), eq(noteLink.fromNoteId, noteId)))
      .orderBy(desc(noteLink.confidence))
      .limit(limit);
  });
}
