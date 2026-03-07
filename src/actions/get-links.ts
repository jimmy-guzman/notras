"use server";

import { Effect } from "effect";
import { cacheTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { LinkService } from "@/server/services/link-service";

export async function getLinks(noteId: NoteId) {
  return serverAction(async (userId) => {
    "use cache";

    const result = await AppRuntime.runPromise(
      LinkService.pipe(
        Effect.flatMap((svc) => svc.getByNoteId(userId, noteId)),
      ),
    );

    cacheTag("notes", noteId);

    return result;
  });
}
