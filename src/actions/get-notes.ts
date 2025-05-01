"use server";

import { and, desc, eq, isNull, like } from "drizzle-orm";
import invariant from "tiny-invariant";

import type { Kind } from "@/lib/kind";

import { getSession } from "@/lib/auth";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

interface Options {
  kind?: Kind;
  query?: string;
}

export async function getNotes({ kind, query }: Options) {
  const session = await getSession();

  invariant(session, "Unauthorized");

  return await db
    .select()
    .from(note)
    .where(
      and(
        eq(note.userId, session.user.id),
        isNull(note.deletedAt),
        kind ? eq(note.kind, kind) : undefined,
        query ? like(note.content, `%${query}%`) : undefined,
      ),
    )
    .orderBy(desc(note.pinnedAt), desc(note.createdAt));
}
