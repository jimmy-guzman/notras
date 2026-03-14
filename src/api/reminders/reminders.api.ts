import { createRoute } from "@hono/zod-openapi";

export const GetRemindersStreamRoute = createRoute({
  description:
    "Server-sent events stream that emits due reminders as they fire. Polls every 30 seconds.",
  method: "get",
  path: "/stream",
  responses: {
    200: {
      description: "SSE stream of due reminder events.",
      summary: "OK",
    },
  },
  summary: "Reminders SSE Stream",
  tags: ["Reminders"],
});
