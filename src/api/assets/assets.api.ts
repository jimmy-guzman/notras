import { createRoute } from "@hono/zod-openapi";

import { ApiError, AssetIdParam } from "./assets.schema";

export const GetAssetRoute = createRoute({
  description: "Retrieve a stored asset (image or PDF) by its ID.",
  method: "get",
  path: "/{id}",
  request: { params: AssetIdParam },
  responses: {
    200: {
      description: "The asset file.",
      summary: "OK",
    },
    404: {
      content: { "application/json": { schema: ApiError } },
      description: "Asset not found.",
      summary: "Not Found",
    },
    500: {
      content: { "application/json": { schema: ApiError } },
      description: "Internal server error.",
      summary: "Internal Server Error",
    },
  },
  summary: "Get Asset",
  tags: ["Assets"],
});
