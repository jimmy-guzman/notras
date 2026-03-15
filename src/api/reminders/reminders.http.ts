import { Effect, Fiber, Schedule } from "effect";
import { streamSSE } from "hono/streaming";

import { hono } from "@/api/lib/hono";
import { toNoteId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { NoteService } from "@/server/services/note-service";
import { UserService } from "@/server/services/user-service";

import { GetRemindersStreamRoute } from "./reminders.api";

export const remindersApp = hono();

remindersApp.openapi(GetRemindersStreamRoute, (c) => {
  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const userId = yield* UserService.pipe(
        Effect.flatMap((svc) => svc.getDeviceUserId()),
      );

      return streamSSE(c, (stream) => {
        return AppRuntime.runPromise(
          Effect.gen(function* () {
            const notified = new Set<string>();

            const check = Effect.gen(function* () {
              const dueNotes = yield* NoteService.pipe(
                Effect.flatMap((svc) => svc.getDueReminders(userId)),
              );

              for (const dueNote of dueNotes) {
                if (!dueNote.remindAt) continue;

                const key = `${dueNote.id}:${dueNote.remindAt.getTime()}`;

                if (notified.has(key)) continue;

                notified.add(key);

                const noteId = toNoteId(dueNote.id);

                yield* Effect.promise(() => {
                  return stream.writeSSE({
                    data: JSON.stringify({ content: dueNote.content, noteId }),
                  });
                });
              }
            }).pipe(
              // Intentional: catch defects per-poll so the fiber (and SSE
              // stream) survives transient failures (e.g. DB unavailable).
              // This preserves the current try/catch resilience semantics.
              // If fail-fast is ever preferred, remove this wrapper and let
              // the defect propagate — Effect.repeat will stop and the fiber
              // will die, leaving the stream open until the client reconnects.
              Effect.catchAllDefect((defect) => {
                return Effect.logError("reminder polling failed", { defect });
              }),
            );

            const fiber = yield* Effect.repeat(
              check,
              Schedule.spaced("30 seconds"),
            ).pipe(Effect.fork);

            yield* Effect.async((resume) => {
              stream.onAbort(() => {
                resume(Effect.void);
              });
            });

            yield* Fiber.interrupt(fiber);
          }),
        );
      });
    }),
  );
});
