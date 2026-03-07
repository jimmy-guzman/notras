"use server";

import { Effect } from "effect";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { NoteService } from "@/server/services/note-service";

export async function getOverdueReminders() {
  return serverAction(async (userId) => {
    return AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => svc.list(userId, { remind: "overdue" })),
      ),
    );
  });
}

export async function getUpcomingReminders() {
  return serverAction(async (userId) => {
    return AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => svc.list(userId, { remind: "upcoming" })),
      ),
    );
  });
}
