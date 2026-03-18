import { Effect } from "effect";
import { createSafeActionClient } from "next-safe-action";

import { AppRuntime } from "@/server/layer";
import { UserService } from "@/server/services/user-service";

const actionClient = createSafeActionClient({
  handleServerError() {
    return "something went wrong. please try again.";
  },
});

export const authActionClient = actionClient.use(async ({ next }) => {
  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  return next({ ctx: { userId } });
});
