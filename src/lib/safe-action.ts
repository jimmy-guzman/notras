import { createSafeActionClient } from "next-safe-action";

import { getUserService } from "@/server/services/user-service";

export const actionClient = createSafeActionClient({
  handleServerError(e) {
    return e.message;
  },
}).use(async ({ next }) => {
  const userId = await getUserService().getDeviceUserId();

  return next({ ctx: { userId } });
});
