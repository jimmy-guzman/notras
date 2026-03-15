import { Effect } from "effect";
import { cacheTag } from "next/cache";

import type { NoteId } from "@/lib/id";

import { AppRuntime } from "@/server/layer";
import { TagService } from "@/server/services/tag-service";
import { UserService } from "@/server/services/user-service";

export async function getNoteTags(noteId: NoteId) {
  "use cache";

  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  const result = await AppRuntime.runPromise(
    TagService.pipe(
      Effect.flatMap((svc) => svc.getTagsForNote(userId, noteId)),
    ),
  );

  cacheTag("notes", "tags");

  return result;
}
