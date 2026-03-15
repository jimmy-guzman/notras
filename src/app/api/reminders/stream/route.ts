import { Effect, Fiber, Schedule } from "effect";

import { toNoteId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { NoteService } from "@/server/services/note-service";
import { UserService } from "@/server/services/user-service";

export async function GET(request: Request) {
  try {
    const userId = await AppRuntime.runPromise(
      UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
    );

    const { signal } = request;
    const abort = new AbortController();

    let cancelledByStream = false;

    const stream = new ReadableStream({
      cancel() {
        cancelledByStream = true;
        abort.abort();
      },
      start(controller) {
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
            const data = JSON.stringify({ content: dueNote.content, noteId });

            controller.enqueue(`data: ${data}\n\n`);
          }
        }).pipe(
          // Intentional: catch defects per-poll so the fiber (and SSE
          // stream) survives transient failures (e.g. DB unavailable).
          Effect.catchAllDefect((defect) => {
            return Effect.logError("reminder polling failed", defect);
          }),
        );

        void AppRuntime.runPromise(
          Effect.gen(function* () {
            const fiber = yield* Effect.repeat(
              check,
              Schedule.spaced("30 seconds"),
            ).pipe(Effect.fork);

            yield* Effect.async<undefined>((resume) => {
              abort.signal.addEventListener("abort", () => {
                resume(Effect.succeed(undefined));
              });
            });

            yield* Fiber.interrupt(fiber);

            if (!cancelledByStream) {
              controller.close();
            }
          }).pipe(
            Effect.catchAllDefect((defect) => {
              return Effect.logError(
                "GET /api/reminders/stream failed",
                defect,
              );
            }),
          ),
        );

        signal.addEventListener("abort", () => {
          abort.abort();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    await AppRuntime.runPromise(
      Effect.logError("GET /api/reminders/stream failed", error),
    );

    return Response.json(
      { message: "internal server error.", status: 500 },
      { status: 500 },
    );
  }
}
