"use server";

import { and, sql } from "drizzle-orm";
import { updateTag } from "next/cache";

import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

import { linkSimilarNotes } from "./link-similar-notes";

const DEFAULT_BATCH_SIZE = 10;

export async function refreshUnlinkedNotes({
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
  const notesToProcess = await db
    .select({
      content: note.content,
      id: note.id,
    })
    .from(note)
    .where(
      and(
        sql`NOT EXISTS (
          SELECT 1 FROM note_link
          WHERE note_link.from_note_id = ${note.id}
          AND note_link.reason = 'semantic'
        )`,
        sql`embedding IS NOT NULL`,
        sql`deleted_at IS NULL`,
      ),
    )
    .limit(batchSize);

  for (const n of notesToProcess) {
    await linkSimilarNotes(n.id, n.content);
  }

  if (notesToProcess.length > 0) {
    updateTag("notes");
  }

  return { processed: notesToProcess.length };
}
