"use server";

import { serverAction } from "@/lib/authorized";
import { getNoteService } from "@/server/services/note-service";

export async function getFiredRemindersCount() {
  return serverAction(async (userId) => {
    return getNoteService().countOverdueReminders(userId);
  });
}
