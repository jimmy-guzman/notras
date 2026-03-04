"use server";

import { cacheTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { getTagService } from "@/server/services/tag-service";

export async function getTags() {
  return serverAction(async (userId) => {
    "use cache";

    const result = await getTagService().getAllTags(userId);

    cacheTag("notes", "tags");

    return result;
  });
}
