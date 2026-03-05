"use server";

import { cacheTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { getFolderService } from "@/server/services/folder-service";

export async function getFolders() {
  return serverAction(async (userId) => {
    "use cache";

    const result = await getFolderService().getAll(userId);

    cacheTag("notes");

    return result;
  });
}
