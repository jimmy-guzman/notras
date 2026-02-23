"use server";

import { revalidatePath, updateTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { toNoteId } from "@/lib/id";
import { uploadAssetsSchema } from "@/server/schemas/asset-schemas";
import { getAssetService } from "@/server/services/asset-service";

export async function uploadAssets(formData: FormData) {
  const files = formData.getAll("files");
  const noteId = formData.get("noteId");

  const { files: validFiles, noteId: validNoteId } = uploadAssetsSchema.parse({
    files,
    noteId,
  });

  const typedNoteId = toNoteId(validNoteId);

  await serverAction(async (userId) => {
    for (const file of validFiles) {
      await getAssetService().upload(userId, typedNoteId, file);
    }
  });

  updateTag("notes");
  revalidatePath(`/notes/${typedNoteId}`);
}
