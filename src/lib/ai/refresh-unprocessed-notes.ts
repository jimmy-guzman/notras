"use server";

import { and, isNull } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import { getOrCreateAIKind } from "@/lib/ai/get-or-create-ai-kind";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

import { getOrCreateEmbedding } from "./get-or-create-embedding";

const DEFAULT_BATCH_SIZE = 10;

export async function refreshUnprocessedNotes({
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
  const notesToProcess = await db
    .select({
      content: note.content,
      id: note.id,
    })
    .from(note)
    .where(and(isNull(note.kind), isNull(note.deletedAt)))
    .limit(batchSize);

  for (const n of notesToProcess) {
    await Promise.all([
      getOrCreateAIKind(n.id, n.content),
      getOrCreateEmbedding(n.id, n.content),
    ]);
  }

  if (notesToProcess.length > 0) {
    revalidateTag("notes");
  }

  return { processed: notesToProcess.length };
}
