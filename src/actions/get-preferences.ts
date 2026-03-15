import { Effect } from "effect";
import { cacheTag } from "next/cache";

import { AppRuntime } from "@/server/layer";
import { UserService } from "@/server/services/user-service";

export async function getPreferences() {
  "use cache";

  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  const result = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getPreferences(userId))),
  );

  cacheTag("preferences");

  return result;
}
