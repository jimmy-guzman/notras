"use server";

import { Effect, Schema } from "effect";
import { revalidatePath, updateTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { toNoteId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { uploadAssetsSchema } from "@/server/schemas/asset-schemas";
import { AssetService } from "@/server/services/asset-service";

export async function uploadAssets(formData: FormData) {
  const files = formData.getAll("files");
  const noteId = formData.get("noteId");

  const { files: validFiles, noteId: validNoteId } = Schema.decodeUnknownSync(
    uploadAssetsSchema,
  )({
    files,
    noteId,
  });

  const typedNoteId = toNoteId(validNoteId);

  await serverAction(async (userId) => {
    for (const file of validFiles) {
      await AppRuntime.runPromise(
        AssetService.pipe(
          Effect.flatMap((svc) => svc.upload(userId, typedNoteId, file)),
        ),
      );
    }
  });

  updateTag("notes");
  revalidatePath(`/notes/${typedNoteId}`);
}
