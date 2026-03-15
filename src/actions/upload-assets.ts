"use server";

import { Effect, Schema } from "effect";
import { revalidatePath, updateTag } from "next/cache";

import { toNoteId } from "@/lib/id";
import { authedProcedure } from "@/lib/orpc";
import { AppRuntime } from "@/server/layer";
import { uploadAssetsSchema } from "@/server/schemas/asset-schemas";
import { AssetService } from "@/server/services/asset-service";

export const uploadAssets = authedProcedure
  .input(Schema.standardSchemaV1(uploadAssetsSchema))
  .handler(async ({ context, input }) => {
    const typedNoteId = toNoteId(input.noteId);

    for (const file of input.files) {
      await AppRuntime.runPromise(
        AssetService.pipe(
          Effect.flatMap((svc) =>
            svc.upload(context.userId, typedNoteId, file),
          ),
        ),
      );
    }

    updateTag("notes");
    revalidatePath(`/notes/${typedNoteId}`);
  })
  .actionable();
