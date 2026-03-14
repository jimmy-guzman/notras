import { z } from "@hono/zod-openapi";

import { ASSET_ID_PATTERN } from "@/server/schemas/asset-schemas";

export const AssetIdParam = z
  .object({
    id: z
      .string()
      .regex(ASSET_ID_PATTERN)
      .openapi({ example: "asset_01h455vb4pex5vsknk084sn02q" }),
  })
  .openapi("AssetIdParam");

export const ApiError = z
  .object({
    details: z.unknown().optional(),
    message: z.string().openapi({ example: "not found." }),
    status: z.number().int().min(100).max(599).openapi({ example: 404 }),
  })
  .openapi("ApiError");
