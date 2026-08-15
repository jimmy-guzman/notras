import { Effect } from "effect";
import { cacheTag } from "next/cache";

import { AppRuntime } from "@/server/runtime";
import { TagService } from "@/server/services/tag-service";
import { UserService } from "@/server/services/user-service";

export async function getTags() {
  "use cache";

  const userId = await AppRuntime.runPromise(
    UserService.pipe(
      Effect.flatMap((svc) => {
        return svc.getDeviceUserId();
      }),
    ),
  );

  const result = await AppRuntime.runPromise(
    TagService.pipe(
      Effect.flatMap((svc) => {
        return svc.getAllTags(userId);
      }),
    ),
  );

  cacheTag("notes", "tags");

  return result;
}
