"use server";

import { and, eq, isNull } from "drizzle-orm";
import { cacheTag } from "next/dist/server/use-cache/cache-tag";

import { authorizedServerAction } from "@/lib/authorized";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function getNote(id: string) {
  return authorizedServerAction(async (userId) => {
    "use cache";

    const results = await db
      .select()
      .from(note)
      .where(
        and(eq(note.id, id), eq(note.userId, userId), isNull(note.deletedAt)),
      )
      .limit(1);

    cacheTag(`note:${id}`);

    return results.length > 0 ? results[0] : undefined;
  });
}
