"use server";

import { cacheTag } from "next/dist/server/use-cache/cache-tag";
import { createLoader } from "nuqs/server";

import type { NoteId } from "@/lib/id";
import type { NoteSearchParams } from "@/lib/notes-search-params";
import type { PinFilter } from "@/server/repositories/note-repository";

import { serverAction } from "@/lib/authorized";
import { parsers } from "@/lib/notes-search-params";
import { getNoteService } from "@/server/services/note-service";
import { getTagService } from "@/server/services/tag-service";

export const loadSearchParams = createLoader(parsers);

export async function getNotes(
  searchParams: NoteSearchParams,
  options?: PinFilter & { limit?: number },
) {
  return serverAction(async (userId) => {
    "use cache";

    const { q: query, sort, tag, time } = searchParams;

    const result = await getNoteService().list(userId, {
      ...options,
      query,
      sort,
      tag,
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

    cacheTag("notes");

    return result;
  });
}

export async function getTagsForNotes(noteIds: NoteId[]) {
  return serverAction(async (userId) => {
    "use cache";

    const result = await getTagService().getTagsForNotes(userId, noteIds);

    cacheTag("notes", "tags");

    return result;
  });
}
