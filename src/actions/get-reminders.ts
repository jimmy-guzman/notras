"use server";

import { serverAction } from "@/lib/authorized";
import { getNoteService } from "@/server/services/note-service";

export async function getOverdueReminders() {
  return serverAction(async (userId) => {
    return getNoteService().list(userId, { remind: "overdue" });
  });
}

export async function getUpcomingReminders() {
  return serverAction(async (userId) => {
    return getNoteService().list(userId, { remind: "upcoming" });
  });
}
