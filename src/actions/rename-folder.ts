"use server";

import { updateTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { toFolderId } from "@/lib/id";
import { renameFolderSchema } from "@/server/schemas/folder-schemas";
import { getFolderService } from "@/server/services/folder-service";

export async function renameFolder(formData: FormData) {
  const { folderId: folderIdRaw, name } = renameFolderSchema.parse({
    folderId: formData.get("folderId"),
    name: formData.get("name"),
  });

  const folderId = toFolderId(folderIdRaw);

  await serverAction(async (userId) => {
    await getFolderService().rename(userId, folderId, name);
  });

  updateTag("folders");
  updateTag("notes");
}
