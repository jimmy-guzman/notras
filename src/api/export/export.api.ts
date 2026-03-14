import { createRoute, z } from "@hono/zod-openapi";

const ApiError = z
  .object({
    details: z.unknown().optional(),
    message: z.string().openapi({ example: "export failed." }),
    status: z.number().int().min(100).max(599).openapi({ example: 500 }),
  })
  .openapi("ExportApiError");

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
