"use server";

import { Effect, Schema } from "effect";
import { revalidatePath, updateTag } from "next/cache";

import { toAssetId } from "@/core";
import { authActionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/runtime";
import { deleteAssetSchema } from "@/server/schemas/asset-schemas";
import { AssetService } from "@/server/services/asset-service";

export const deleteAsset = authActionClient
  .inputSchema(Schema.standardSchemaV1(deleteAssetSchema))
  .action(async ({ ctx, parsedInput }) => {
    const typedAssetId = toAssetId(parsedInput.assetId);

    await AppRuntime.runPromise(
      AssetService.pipe(
        Effect.flatMap((svc) => {
          return svc.delete(ctx.userId, typedAssetId);
        }),
      ),
    );

    updateTag("notes");
    revalidatePath(`/notes/${parsedInput.noteId}`);
  });
