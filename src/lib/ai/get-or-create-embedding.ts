import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

import { generateEmbedding } from "./generate-embedding";

export async function getOrCreateEmbedding(noteId: string, content: string) {
  const [existing] = await db
    .select({
      aiCreatedAt: note.aiCreatedAt,
      embedding: note.embedding,
    })
    .from(note)
    .where(eq(note.id, noteId));

  if (existing.embedding) {
    return existing.embedding;
  }

  const embedding = await generateEmbedding(content);
  const now = new Date();

  await db
    .update(note)
    .set({
      aiCreatedAt: now,
      aiUpdatedAt: now,
      embedding,
    })
    .where(eq(note.id, noteId));

  return embedding;
}
