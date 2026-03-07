"use server";

import { Effect } from "effect";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { NoteService } from "@/server/services/note-service";

export async function getFiredRemindersCount() {
  return serverAction(async (userId) => {
    return AppRuntime.runPromise(
      NoteService.pipe(
        Effect.flatMap((svc) => svc.countOverdueReminders(userId)),
      ),
    );
  });
}
