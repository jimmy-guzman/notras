import { createSafeActionClient } from "next-safe-action";

const actionClient = createSafeActionClient({
  handleServerError(e) {
    return e.message;
  },
});

export const authActionClient = actionClient.use(async ({ next }) => {
  return next({ ctx: { userId: "device" } });
});
