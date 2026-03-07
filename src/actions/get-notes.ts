"use server";

import { Effect } from "effect";
import { cacheTag } from "next/cache";
import { createLoader } from "nuqs/server";

import type { NoteId } from "@/lib/id";
import type { NoteSearchParams } from "@/lib/notes-search-params";
import type { PinFilter } from "@/server/repositories/note-repository";

import { serverAction } from "@/lib/authorized";
import { toFolderId } from "@/lib/id";
import { parsers } from "@/lib/notes-search-params";
import { AppRuntime } from "@/server/layer";
import { NoteService } from "@/server/services/note-service";
import { TagService } from "@/server/services/tag-service";

export const loadSearchParams = createLoader(parsers);

export async function getNotes(
  searchParams: NoteSearchParams,
  options?: PinFilter & { limit?: number },
) {
  return serverAction(async (userId) => {
    "use cache";

    const { folder, q: query, sort, tag, time } = searchParams;
    const folderId =
      folder && /^folder_[\da-hjkmnp-tv-z]{26}$/.test(folder)
        ? toFolderId(folder)
        : undefined;

    const result = await AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => {
          return svc.list(userId, {
            ...options,
            folderId,
            query,
            sort,
            tag,
            time,
          });
        }),
      ),
    );

    cacheTag("notes");

    return result;
  });
}

export async function getNotesCount() {
  return serverAction(async (userId) => {
    "use cache";

    const result = await AppRuntime.runPromise(
      NoteService.pipe(Effect.flatMap((svc) => svc.count(userId))),
    );

    cacheTag("notes");

    return result;
  });
}

export async function getTagsForNotes(noteIds: NoteId[]) {
  return serverAction(async (userId) => {
    "use cache";

    const result = await AppRuntime.runPromise(
      TagService.pipe(
        Effect.flatMap((svc) => svc.getTagsForNotes(userId, noteIds)),
      ),
    );

    cacheTag("notes", "tags");

    return result;
  });
}
