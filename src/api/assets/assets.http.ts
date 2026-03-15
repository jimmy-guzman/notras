import { Effect } from "effect";

import { hono } from "@/api/lib/hono";
import { toAssetId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { AssetService } from "@/server/services/asset-service";
import { UserService } from "@/server/services/user-service";

import { GetAssetRoute } from "./assets.api";

export const assetsApp = hono();

assetsApp.openapi(GetAssetRoute, (c) => {
  const { id } = c.req.valid("param");

  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const userId = yield* UserService.pipe(
        Effect.flatMap((svc) => svc.getDeviceUserId()),
      );
      const asset = yield* AssetService.pipe(
        Effect.flatMap((svc) => svc.get(userId, toAssetId(id))),
      );

      if (!asset) {
        return c.json({ message: "asset not found.", status: 404 }, 404);
      }

      const { data } = asset;
      const safeFileName = asset.fileName
        .replaceAll(/[^\u0020-\u007E]/g, "")
        .replaceAll('"', String.raw`\"`);

      return new Response(
        new Uint8Array(
          data.buffer,
          data.byteOffset,
          data.byteLength,
        ) as BodyInit,
        {
          headers: {
            "Cache-Control": "private, max-age=31536000, immutable",
            "Content-Disposition": `inline; filename="${safeFileName}"`,
            "Content-Length": data.byteLength.toString(),
            "Content-Type": asset.mimeType,
          },
        },
      );
    }).pipe(
      Effect.catchAllDefect((defect) => {
        return Effect.gen(function* () {
          yield* Effect.logError("GET /assets/:id failed", defect);

          return c.json(
            { message: "internal server error.", status: 500 },
            500,
          );
        });
      }),
    ),
  );
});
