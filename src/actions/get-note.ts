"use server";

import { Effect } from "effect";
import { cacheTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { NoteService } from "@/server/services/note-service";

export async function getNote(id: NoteId) {
  return serverAction(async (userId) => {
    "use cache";

    const result = await AppRuntime.runPromise(
      NoteService.pipe(Effect.flatMap((svc) => svc.getById(userId, id))),
    );

    cacheTag("notes", id);

    return result;
  });
}
