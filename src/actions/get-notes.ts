"use server";

import { cacheTag } from "next/dist/server/use-cache/cache-tag";
import { createLoader } from "nuqs/server";

import type { NoteSearchParams } from "@/lib/notes-search-params";

import { serverAction } from "@/lib/authorized";
import { parsers } from "@/lib/notes-search-params";
import { getNoteService } from "@/server/services/note-service";

export const loadSearchParams = createLoader(parsers);

export async function getNotes(
  searchParams: NoteSearchParams,
  options?: { excludePinned?: boolean; limit?: number },
) {
  return serverAction(async (userId) => {
    "use cache";

    const { q: query, sort, time } = searchParams;

    const result = await getNoteService().list(userId, {
      excludePinned: options?.excludePinned,
      limit: options?.limit,
      query: query || undefined,
      sort,
      time,
    });

    cacheTag("notes");

    return result;
  });
}

export async function getNotesCount() {
  return serverAction(async (userId) => {
    "use cache";

    const result = await getNoteService().count(userId);

    cacheTag("notes count");

    return result;
  });
}
