"use server";

import { Effect } from "effect";
import { cacheTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { TagService } from "@/server/services/tag-service";

export async function getNoteTags(noteId: NoteId) {
  return serverAction(async (userId) => {
    "use cache";

    const result = await AppRuntime.runPromise(
      TagService.pipe(
        Effect.flatMap((svc) => svc.getTagsForNote(userId, noteId)),
      ),
    );

    cacheTag("notes", "tags");

    return result;
  });
}
