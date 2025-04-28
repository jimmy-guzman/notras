"use server";

import { nanoid } from "nanoid";
import invariant from "tiny-invariant";

import { getSession } from "@/lib/auth";
import { db } from "@/server/db";
import { note } from "@/server/db/schemas/notes";

export async function saveNote(content: string) {
  const session = await getSession();

  invariant(session, "Unauthorized");

  await db.insert(note).values({
    content,
    createdAt: new Date(),
    id: nanoid(),
    updatedAt: new Date(),
    userId: session.user.id,
  });
}
