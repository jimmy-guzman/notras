"use server";

import { cacheTag } from "next/dist/server/use-cache/cache-tag";

import type { NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { getTagService } from "@/server/services/tag-service";

export async function getNoteTags(noteId: NoteId) {
  return serverAction(async (userId) => {
    "use cache";

    const result = await getTagService().getTagsForNote(userId, noteId);

    cacheTag("notes", "tags");

    return result;
  });
}
