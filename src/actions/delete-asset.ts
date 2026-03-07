"use server";

import { Effect, Schema } from "effect";
import { revalidatePath, updateTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { toAssetId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { deleteAssetSchema } from "@/server/schemas/asset-schemas";
import { AssetService } from "@/server/services/asset-service";

export async function deleteAsset(formData: FormData) {
  const { assetId, noteId } = Schema.decodeUnknownSync(deleteAssetSchema)({
    assetId: formData.get("assetId"),
    noteId: formData.get("noteId"),
  });

  const typedAssetId = toAssetId(assetId);

  await serverAction(async (userId) => {
    await AppRuntime.runPromise(
      AssetService.pipe(
        Effect.flatMap((svc) => svc.delete(userId, typedAssetId)),
      ),
    );
  });

  updateTag("notes");
  revalidatePath(`/notes/${noteId}`);
}
