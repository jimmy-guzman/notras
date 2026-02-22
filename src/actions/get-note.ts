"use server";

import { cacheTag } from "next/dist/server/use-cache/cache-tag";

import type { NoteId } from "@/lib/id";

import { authorizedServerAction } from "@/lib/authorized";
import { getNoteService } from "@/server/services/note-service";

export async function getNote(id: NoteId) {
  return authorizedServerAction(async (userId) => {
    "use cache";

    const result = await getNoteService().getById(userId, id);

    cacheTag("notes", id);

    return result;
  });
}
