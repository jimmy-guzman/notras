import { Effect } from "effect";

import { toAssetId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { ASSET_ID_PATTERN } from "@/server/schemas/asset-schemas";
import { AssetService } from "@/server/services/asset-service";
import { UserService } from "@/server/services/user-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  if (!ASSET_ID_PATTERN.test(id)) {
    return Response.json(
      { message: "asset not found.", status: 404 },
      { status: 404 },
    );
  }

  try {
    const result = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const userId = yield* UserService.pipe(
          Effect.flatMap((svc) => svc.getDeviceUserId()),
        );

        return yield* AssetService.pipe(
          Effect.flatMap((svc) => svc.get(userId, toAssetId(id))),
        );
      }),
    );

    if (!result) {
      return Response.json(
        { message: "asset not found.", status: 404 },
        { status: 404 },
      );
    }

    const { data } = result;
    const isSvg = result.mimeType === "image/svg+xml";
    const safeFileName = result.fileName
      .replaceAll(/[^\u0020-\u007E]/g, "")
      .replaceAll('"', String.raw`\"`);

    return new Response(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength) as BodyInit,
      {
        headers: {
          "Cache-Control": "private, max-age=31536000, immutable",
          "Content-Disposition": isSvg
            ? `attachment; filename="${safeFileName}"`
            : `inline; filename="${safeFileName}"`,
          "Content-Length": data.byteLength.toString(),
          "Content-Type": isSvg ? "application/octet-stream" : result.mimeType,
        },
      },
    );
  } catch (error) {
    await AppRuntime.runPromise(
      Effect.logError("GET /api/assets/:id failed", error),
    );

    return Response.json(
      { message: "internal server error.", status: 500 },
      { status: 500 },
    );
  }
}
