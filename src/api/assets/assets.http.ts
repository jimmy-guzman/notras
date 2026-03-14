import { Effect } from "effect";

import { hono } from "@/api/lib/hono";
import { toAssetId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { AssetService } from "@/server/services/asset-service";
import { UserService } from "@/server/services/user-service";

import { GetAssetRoute } from "./assets.api";

export const assetsApp = hono();

assetsApp.openapi(GetAssetRoute, async (c) => {
  const { id } = c.req.valid("param");

  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  const result = await AppRuntime.runPromise(
    AssetService.pipe(
      Effect.flatMap((svc) => svc.get(userId, toAssetId(id))),
      Effect.either,
    ),
  );

  if (result._tag === "Left") {
    return c.json({ message: "internal server error.", status: 500 }, 500);
  }

  const asset = result.right;

  if (!asset) {
    return c.json({ message: "asset not found.", status: 404 }, 404);
  }

  const { data } = asset;

  const safeFileName = asset.fileName
    .replaceAll(/[^\u0020-\u007E]/g, "")
    .replaceAll('"', String.raw`\"`);

  return new Response(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength) as BodyInit,
    {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${safeFileName}"`,
        "Content-Length": data.byteLength.toString(),
        "Content-Type": asset.mimeType,
      },
    },
  );
});
