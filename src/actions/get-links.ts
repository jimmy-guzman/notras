import { Effect } from "effect";
import { cacheTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { AppRuntime } from "@/server/layer";
import { LinkService } from "@/server/services/link-service";
import { UserService } from "@/server/services/user-service";

export async function getLinks(noteId: NoteId) {
  "use cache";

  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  const result = await AppRuntime.runPromise(
    LinkService.pipe(Effect.flatMap((svc) => svc.getByNoteId(userId, noteId))),
  );

  cacheTag("notes", noteId);

  return result;
}
