"use server";

import { Effect, Schema } from "effect";
import { revalidatePath, updateTag } from "next/cache";

import { toNoteId } from "@/lib/id";
import { authActionClient } from "@/lib/safe-action";
import { AppRuntime } from "@/server/layer";
import { uploadAssetsSchema } from "@/server/schemas/asset-schemas";
import { AssetService } from "@/server/services/asset-service";

export const uploadAssets = authActionClient
  .inputSchema(Schema.standardSchemaV1(uploadAssetsSchema))
  .action(async ({ ctx, parsedInput }) => {
    const typedNoteId = toNoteId(parsedInput.noteId);

    let firstError: Error | undefined;

    for (const file of parsedInput.files) {
      try {
        await AppRuntime.runPromise(
          AssetService.pipe(
            Effect.flatMap((svc) => svc.upload(ctx.userId, typedNoteId, file)),
          ),
        );
      } catch (error) {
        firstError ??=
          error instanceof Error ? error : new Error(String(error));
      }
    }

    updateTag("notes");
    revalidatePath(`/notes/${typedNoteId}`);

    if (firstError !== undefined) throw firstError;
  });
