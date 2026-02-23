"use server";

import { revalidatePath, updateTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { toAssetId } from "@/lib/id";
import { deleteAssetSchema } from "@/server/schemas/asset-schemas";
import { getAssetService } from "@/server/services/asset-service";

export async function deleteAsset(formData: FormData) {
  const { assetId, noteId } = deleteAssetSchema.parse({
    assetId: formData.get("assetId"),
    noteId: formData.get("noteId"),
  });

  const typedAssetId = toAssetId(assetId);

  await serverAction(async (userId) => {
    await getAssetService().delete(userId, typedAssetId);
  });

  updateTag("notes");
  revalidatePath(`/notes/${noteId}`);
}
