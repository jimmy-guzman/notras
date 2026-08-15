import { Effect } from "effect";

import { AppRuntime } from "@/server/runtime";
import { UserService } from "@/server/services/user-service";

export async function getProfile() {
  const userId = await AppRuntime.runPromise(
    UserService.pipe(
      Effect.flatMap((svc) => {
        return svc.getDeviceUserId();
      }),
    ),
  );

  return AppRuntime.runPromise(
    UserService.pipe(
      Effect.flatMap((svc) => {
        return svc.getProfile(userId);
      }),
    ),
  );
}
