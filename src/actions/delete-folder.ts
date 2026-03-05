"use server";

import { updateTag } from "next/cache";

import type { FolderId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { getFolderService } from "@/server/services/folder-service";

export async function deleteFolder(folderId: FolderId) {
  await serverAction(async (userId) => {
    await getFolderService().delete(userId, folderId);
  });

  updateTag("folders");
  updateTag("notes");
}
