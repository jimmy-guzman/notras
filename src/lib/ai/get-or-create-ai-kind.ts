import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

import { inferKindFromContent } from "./infer-kind-from-content";

export async function getOrCreateAIKind(noteId: string, content: string) {
  const [existing] = await db
    .select({
      aiCreatedAt: note.aiCreatedAt,
      kind: note.kind,
    })
    .from(note)
    .where(eq(note.id, noteId));

  if (existing.kind) {
    return existing.kind;
  }

  const inferredKind = await inferKindFromContent(content);
  const now = new Date();

  await db
    .update(note)
    .set({
      aiCreatedAt: now,
      aiUpdatedAt: now,
      kind: inferredKind,
      metadata: {
        aiKindInferred: true,
      },
    })
    .where(eq(note.id, noteId));

  return inferredKind;
}
