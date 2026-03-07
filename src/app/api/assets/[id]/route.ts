import { Effect } from "effect";

import { serverAction } from "@/lib/authorized";
import { toAssetId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { AssetService } from "@/server/services/asset-service";

const ASSET_ID_PATTERN = /^asset_[\da-hjkmnp-tv-z]{26}$/;

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!ASSET_ID_PATTERN.test(id)) {
    return new Response("invalid asset id", { status: 400 });
  }

  const asset = await serverAction(async (userId) => {
    return AppRuntime.runPromise(
      AssetService.pipe(
        Effect.flatMap((svc) => svc.get(userId, toAssetId(id))),
      ),
    );
  });

  if (!asset) {
    return new Response("not found", { status: 404 });
  }

  const { data } = asset;

  // Sanitize filename for Content-Disposition header (ASCII only)
  const safeFileName = asset.fileName
    .replaceAll(/[^\u0020-\u007E]/g, "") // Remove non-ASCII
    .replaceAll('"', String.raw`\"`); // Escape quotes

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
}
