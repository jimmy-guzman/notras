"use server";

import { cacheTag } from "next/dist/server/use-cache/cache-tag";

import { serverAction } from "@/lib/authorized";
import { getUserService } from "@/server/services/user-service";

export async function getPreferences() {
  return serverAction(async (userId) => {
    "use cache";

    const result = await getUserService().getPreferences(userId);

    cacheTag("preferences");

    return result;
  });
}
