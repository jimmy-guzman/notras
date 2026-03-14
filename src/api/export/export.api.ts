import { createRoute } from "@hono/zod-openapi";

import { ApiError } from "@/api/assets/assets.schema";

export const GetExportRoute = createRoute({
  description:
    "Download a ZIP archive of all notes, folders, tags, and assets.",
  method: "get",
  path: "/",
  responses: {
    200: {
      description: "ZIP archive of all data.",
      summary: "OK",
    },
    500: {
      content: { "application/json": { schema: ApiError } },
      description: "Export failed.",
      summary: "Internal Server Error",
    },
  },
  summary: "Export All Data",
  tags: ["Export"],
});
