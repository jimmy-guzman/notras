import { Effect } from "effect";
import { cacheTag } from "next/cache";

import type { NoteId } from "@/core";

import { AppRuntime } from "@/server/runtime";
import { LinkService } from "@/server/services/link-service";
import { UserService } from "@/server/services/user-service";

export async function getLinks(noteId: NoteId) {
  "use cache";

  cacheTag("notes", noteId);

  const userId = await AppRuntime.runPromise(
    UserService.pipe(
      Effect.flatMap((svc) => {
        return svc.getDeviceUserId();
      }),
    ),
  );

  const result = await AppRuntime.runPromise(
    LinkService.pipe(
      Effect.flatMap((svc) => {
        return svc.getByNoteId(userId, noteId);
      }),
    ),
  );

  return result;
}
