import { Effect } from "effect";
import { cacheTag } from "next/cache";

import type { NoteId } from "@/core";

import { AppRuntime } from "@/server/runtime";
import { NoteService } from "@/server/services/note-service";
import { UserService } from "@/server/services/user-service";

export async function getNote(id: NoteId) {
  "use cache";

  const userId = await AppRuntime.runPromise(
    UserService.pipe(
      Effect.flatMap((svc) => {
        return svc.getDeviceUserId();
      }),
    ),
  );

  const result = await AppRuntime.runPromise(
    NoteService.pipe(
      Effect.flatMap((svc) => {
        return svc.getById(userId, id);
      }),
    ),
  );

  cacheTag("notes", id);

  return result;
}
