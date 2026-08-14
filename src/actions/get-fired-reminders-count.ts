import { Effect } from "effect";

import { AppRuntime } from "@/server/layer";
import { NoteService } from "@/server/services/note-service";
import { UserService } from "@/server/services/user-service";

export async function getFiredRemindersCount() {
  const userId = await AppRuntime.runPromise(
    UserService.pipe(
      Effect.flatMap((svc) => {
        return svc.getDeviceUserId();
      }),
    ),
  );

  return AppRuntime.runPromise(
    NoteService.pipe(
      Effect.flatMap((svc) => {
        return svc.countOverdueReminders(userId);
      }),
    ),
  );
}
