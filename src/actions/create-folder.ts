"use server";

import { updateTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { createFolderSchema } from "@/server/schemas/folder-schemas";
import { getFolderService } from "@/server/services/folder-service";

export async function createFolder(formData: FormData) {
  const { name } = createFolderSchema.parse({
    name: formData.get("name"),
  });

  await serverAction(async (userId) => {
    await getFolderService().create(userId, name);
  });

  updateTag("folders");
}
