"use server";

import { and, eq } from "drizzle-orm";
import { cacheTag } from "next/dist/server/use-cache/cache-tag";

import type { NoteId } from "@/lib/id";

import { authorizedServerAction } from "@/lib/authorized";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function getNote(id: NoteId) {
  return authorizedServerAction(async (userId) => {
    "use cache";

    const results = await db
      .select()
      .from(note)
      .where(and(eq(note.id, id), eq(note.userId, userId)))
      .limit(1);

    cacheTag("notes", id);

    return results.length > 0 ? results[0] : undefined;
  });
}
