"use server";

import { cacheTag } from "next/dist/server/use-cache/cache-tag";

import { serverAction } from "@/lib/authorized";
import { getNoteService } from "@/server/services/note-service";

export async function getDueReminders() {
  return serverAction(async (userId) => {
    "use cache";

    const result = await getNoteService().getDueReminders(userId);

    cacheTag("notes");

    return result;
  });
}
