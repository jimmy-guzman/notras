"use server";

import { cacheTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { getNoteService } from "@/server/services/note-service";

export async function getNote(id: NoteId) {
  return serverAction(async (userId) => {
    "use cache";

    const result = await getNoteService().getById(userId, id);

    cacheTag("notes", id);

    return result;
  });
}
