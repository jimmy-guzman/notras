import { Effect } from "effect";

import { AppRuntime } from "@/server/layer";
import { NoteService } from "@/server/services/note-service";
import { UserService } from "@/server/services/user-service";

export async function getOverdueReminders() {
  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  return AppRuntime.runPromise(
    NoteService.pipe(
      Effect.flatMap((svc) => svc.list(userId, { remind: "overdue" })),
    ),
  );
}

export async function getUpcomingReminders() {
  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  return AppRuntime.runPromise(
    NoteService.pipe(
      Effect.flatMap((svc) => svc.list(userId, { remind: "upcoming" })),
    ),
  );
}
