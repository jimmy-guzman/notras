import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/server/db";
import { noteLink } from "@/server/db/schemas/note-link";
import { note } from "@/server/db/schemas/notes";

import { getOrCreateEmbedding } from "./get-or-create-embedding";

// Limit how many links we create and check
const MAX_LINKS = 5; // max to insert
const MAX_NOTES = 25; // max to consider before filtering
const MIN_CONFIDENCE = 0.6; // filter out weak semantic matches
const EMBEDDING_SIZE = 1536; // enforced OpenAI vector size

/**
 * Links a note to semantically similar notes based on embedding similarity
 *
 * @param noteId ID of the note to find similar notes for
 *
 * @param content Content of the note to generate embeddings from
 *
 * @returns Number of links created or undefined if no links were created
 */
export async function linkSimilarNotes(noteId: string, content: string) {
  try {
    // Get or generate the note's embedding vector
    const embedding = await getOrCreateEmbedding(noteId, content);

    // Ensure it's a valid OpenAI embedding
    if (embedding.length !== EMBEDDING_SIZE) return undefined;

    // Get user ID for current note (used to filter for their own notes only)
    const [{ userId }] = await db
      .select({ userId: note.userId })
      .from(note)
      .where(eq(note.id, noteId))
      .limit(1);

    if (!userId) return undefined;

    // Construct a valid pgvector literal for comparison
    const vectorLiteral = `'[${embedding.join(",")}]'::vector`;

    // Query notes ordered by closest cosine distance (ASC)
    // We fetch more than needed so we can filter weak matches afterward
    const result = await db.execute(sql`
      SELECT id, embedding <=> ${sql.raw(vectorLiteral)} AS similarity
      FROM "note"
      WHERE id != ${noteId}
        AND "user_id" = ${userId}
        AND embedding IS NOT NULL
        AND deleted_at IS NULL
      ORDER BY similarity ASC
      LIMIT ${MAX_NOTES};
    `);

    const now = new Date();

    // Convert distances to confidence scores and filter out weak matches
    const toInsert = result.rows
      .map((row) => {
        const distance = Number(row.similarity);
        const confidence = Math.max(0, Math.min(1, 1 - distance / 2));

        if (confidence < MIN_CONFIDENCE) return null;

        return {
          confidence,
          createdAt: now,
          fromNoteId: noteId,
          id: nanoid(),
          reason: "semantic" as const,
          toNoteId: row.id as string,
        };
      })
      .filter(Boolean)
      .slice(0, MAX_LINKS); // cap number of links created

    if (toInsert.length === 0) return undefined;

    // Store links in DB, ignoring duplicates
    await db.insert(noteLink).values(toInsert).onConflictDoNothing();

    return toInsert.length;
  } catch {
    // Swallow error silently for now (cron-safe)
    return undefined;
  }
}
