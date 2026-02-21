"use server";

import { nanoid } from "nanoid";
import { updateTag } from "next/cache";
import invariant from "tiny-invariant";

import { getSession } from "@/lib/auth";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function createNote(content: string) {
  const session = await getSession();

  invariant(session, "Unauthorized");

  const id = nanoid();

  await db.insert(note).values({
    content,
    createdAt: new Date(),
    id,
    updatedAt: new Date(),
    userId: session.user.id,
  });

  updateTag("notes");

  return { id };
}
