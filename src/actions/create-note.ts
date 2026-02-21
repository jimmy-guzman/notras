"use server";

import { nanoid } from "nanoid";
import { updateTag } from "next/cache";
import invariant from "tiny-invariant";

import type { Kind } from "@/lib/kind";

import { getSession } from "@/lib/auth";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function createNote(content: string, kind?: Kind) {
  const session = await getSession();

  invariant(session, "Unauthorized");

  const id = nanoid();

  await db.insert(note).values({
    content,
    createdAt: new Date(),
    id,
    kind,
    updatedAt: new Date(),
    userId: session.user.id,
  });

  updateTag("notes");

  return { id };
}
