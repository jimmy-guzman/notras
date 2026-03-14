import { Effect } from "effect";
import { streamSSE } from "hono/streaming";

import { hono } from "@/api/lib/hono";
import { toNoteId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { NoteService } from "@/server/services/note-service";
import { UserService } from "@/server/services/user-service";

import { GetRemindersStreamRoute } from "./reminders.api";

const POLL_INTERVAL_MS = 30_000;

export const remindersApp = hono();

remindersApp.openapi(GetRemindersStreamRoute, async (c) => {
  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  return streamSSE(c, async (stream) => {
    const notified = new Set<string>();

    const check = async () => {
      try {
        const dueNotes = await AppRuntime.runPromise(
          NoteService.pipe(
            Effect.flatMap((svc) => svc.getDueReminders(userId)),
          ),
        );

        for (const dueNote of dueNotes) {
          if (!dueNote.remindAt) continue;

          const key = `${dueNote.id}:${dueNote.remindAt.getTime()}`;

          if (notified.has(key)) continue;

          notified.add(key);

          const noteId = toNoteId(dueNote.id);

          await stream.writeSSE({
            data: JSON.stringify({ content: dueNote.content, noteId }),
          });
        }
      } catch (error) {
        await AppRuntime.runPromise(
          Effect.logError("reminder polling failed", error),
        );
      }
    };

    await check();

    const interval = setInterval(() => {
      void check();
    }, POLL_INTERVAL_MS);

    stream.onAbort(() => {
      clearInterval(interval);
    });

    await new Promise<void>((resolve) => {
      stream.onAbort(resolve);
    });
  });
});
