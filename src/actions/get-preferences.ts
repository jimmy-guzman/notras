import { Effect } from "effect";
import { cacheTag } from "next/cache";

import { AppRuntime } from "@/server/runtime";
import { UserService } from "@/server/services/user-service";

export async function getPreferences() {
  "use cache";

  const userId = await AppRuntime.runPromise(
    UserService.pipe(
      Effect.flatMap((svc) => {
        return svc.getDeviceUserId();
      }),
    ),
  );

  const result = await AppRuntime.runPromise(
    UserService.pipe(
      Effect.flatMap((svc) => {
        return svc.getPreferences(userId);
      }),
    ),
  );

  cacheTag("preferences");

  return result;
}
