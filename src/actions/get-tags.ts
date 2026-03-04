"use server";

import { cacheTag } from "next/dist/server/use-cache/cache-tag";

import { serverAction } from "@/lib/authorized";
import { getTagService } from "@/server/services/tag-service";

export async function getTags() {
  return serverAction(async (userId) => {
    "use cache";

    const result = await getTagService().getAllTags(userId);

    cacheTag("tags");

    return result;
  });
}
