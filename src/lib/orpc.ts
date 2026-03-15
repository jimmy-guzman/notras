import { os } from "@orpc/server";
import { Effect } from "effect";

import { AppRuntime } from "@/server/layer";
import { UserService } from "@/server/services/user-service";

export const authedProcedure = os.use(async ({ next }) => {
  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  return next({ context: { userId } });
});
