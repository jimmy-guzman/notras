import { Effect } from "effect";
import { createSafeActionClient } from "next-safe-action";

import { AppRuntime } from "@/server/layer";
import { UserService } from "@/server/services/user-service";

export const actionClient = createSafeActionClient({
  handleServerError(e) {
    return e.message;
  },
}).use(async ({ next }) => {
  const userId = await AppRuntime.runPromise(
    Effect.gen(function* () {
      const userService = yield* UserService;

      return yield* userService.getDeviceUserId();
    }),
  );

  return next({ ctx: { userId } });
});
