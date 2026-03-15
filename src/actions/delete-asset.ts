"use server";

import { Effect, Schema } from "effect";
import { revalidatePath, updateTag } from "next/cache";

import { toAssetId } from "@/lib/id";
import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { deleteAssetSchema } from "@/server/schemas/asset-schemas";
import { AssetService } from "@/server/services/asset-service";

export const deleteAsset = authedProcedure
  .input(Schema.standardSchemaV1(deleteAssetSchema))
  .handler(async ({ context, input }) => {
    const typedAssetId = toAssetId(input.assetId);

    await AppRuntime.runPromise(
      AssetService.pipe(
        Effect.flatMap((svc) => svc.delete(context.userId, typedAssetId)),
      ),
    );

    updateTag("notes");
    revalidatePath(`/notes/${input.noteId}`);
  })
  .actionable();
