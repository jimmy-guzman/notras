"use server";

import { cacheTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { getLinkService } from "@/server/services/link-service";

export async function getLinks(noteId: NoteId) {
  return serverAction(async (userId) => {
    "use cache";

    const result = await getLinkService().getByNoteId(userId, noteId);

    cacheTag("notes", noteId);

    return result;
  });
}
