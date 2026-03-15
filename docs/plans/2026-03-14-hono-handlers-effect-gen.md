# Refactor Hono handlers to use Effect.gen pipelines

**Date:** 2026-03-14  
**Status:** planned

## Problem

The three Hono handlers in `src/api/` make multiple sequential `AppRuntime.runPromise(...)` calls and stitch results together in plain async functions. This has two concrete issues:

1. **`Effect.either` catches nothing.** All service methods have error channel `never` (every repo call is piped through `Effect.orDie`, converting `DatabaseError` to defects). `Effect.either` only wraps typed errors — it does not catch defects. The `_tag === "Left"` branches in `assets.http.ts` and `export.http.ts` are dead code.

2. **Defects are unhandled or caught awkwardly.** `reminders.http.ts` uses `try/catch` around `AppRuntime.runPromise(...)` and then re-enters the runtime (`AppRuntime.runPromise(Effect.logError(...))`) just to log — escaping and re-entering Effect for a single log call.

## Solution

Wrap each handler body in a single `Effect.gen` pipeline run once at the boundary via `AppRuntime.runPromise`. Handle defects with `Effect.catchAllDefect` and log with `Effect.logError` — all inside Effect, never escaping to `try/catch` or `console.*`.

## Changes

### `src/api/assets/assets.http.ts`

- Replace two sequential `AppRuntime.runPromise` calls with one `Effect.gen`
- Remove `Effect.either` + `_tag === "Left"` dead-code branch
- Remove `Effect.tapError` (no typed errors to tap)
- Add `Effect.catchAllDefect` at the pipeline tail to log and return 500

```ts
assetsApp.openapi(GetAssetRoute, (c) => {
  const { id } = c.req.valid("param");

  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const userId = yield* UserService.pipe(
        Effect.flatMap((svc) => svc.getDeviceUserId()),
      );
      const asset = yield* AssetService.pipe(
        Effect.flatMap((svc) => svc.get(userId, toAssetId(id))),
      );

      if (!asset) {
        return c.json({ message: "asset not found.", status: 404 }, 404);
      }

      const { data } = asset;
      const safeFileName = asset.fileName
        .replaceAll(/[^\u0020-\u007E]/g, "")
        .replaceAll('"', String.raw`\"`);

      return new Response(
        new Uint8Array(
          data.buffer,
          data.byteOffset,
          data.byteLength,
        ) as BodyInit,
        {
          headers: {
            "Cache-Control": "private, max-age=31536000, immutable",
            "Content-Disposition": `inline; filename="${safeFileName}"`,
            "Content-Length": data.byteLength.toString(),
            "Content-Type": asset.mimeType,
          },
        },
      );
    }).pipe(
      Effect.catchAllDefect((defect) =>
        Effect.gen(function* () {
          yield* Effect.logError("GET /assets/:id failed", defect);

          return c.json(
            { message: "internal server error.", status: 500 },
            500,
          );
        }),
      ),
    ),
  );
});
```

### `src/api/export/export.http.ts`

Same pattern. Also adds `Effect.logError` for the defect (currently the 500 branch logs nothing).

```ts
exportApp.openapi(GetExportRoute, (c) => {
  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const userId = yield* UserService.pipe(
        Effect.flatMap((svc) => svc.getDeviceUserId()),
      );
      const zipBuffer = yield* ExportService.pipe(
        Effect.flatMap((svc) => svc.exportAll(userId)),
      );
      const date = new Date().toISOString().slice(0, 10);

      return new Response(zipBuffer as BodyInit, {
        headers: {
          "Content-Disposition": `attachment; filename="notras-export-${date}.zip"`,
          "Content-Length": zipBuffer.byteLength.toString(),
          "Content-Type": "application/zip",
        },
      });
    }).pipe(
      Effect.catchAllDefect((defect) =>
        Effect.gen(function* () {
          yield* Effect.logError("GET /export failed", defect);

          return c.json({ message: "export failed.", status: 500 }, 500);
        }),
      ),
    ),
  );
});
```

### `src/api/reminders/reminders.http.ts`

The most significant change. `streamSSE` stays async (Hono API boundary), but everything inside becomes Effect:

- `check` becomes an `Effect.gen` — no more `try/catch`
- Defects in `check` are caught per-poll with `Effect.catchAllDefect` + `Effect.logError` — **resilient polling is intentional**: the fiber must survive transient DB errors so the SSE stream stays open, matching the current `try/catch` behavior in the live code. Do not remove `catchAllDefect`; if you want fail-fast behavior instead, let the defect propagate and the fiber will die (the stream will hang open until the client reconnects).
- `setInterval` / `clearInterval` replaced by `Effect.repeat(check, Schedule.spaced("30 seconds"))` forked as a background fiber via `Effect.fork`
- Stream abort is modelled as `Effect.async<void>` that resumes when `stream.onAbort` fires
- Fiber is interrupted on abort via `Fiber.interrupt`
- `stream.writeSSE` is wrapped in `Effect.promise`

```ts
remindersApp.openapi(GetRemindersStreamRoute, (c) => {
  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const userId = yield* UserService.pipe(
        Effect.flatMap((svc) => svc.getDeviceUserId()),
      );

      return streamSSE(c, (stream) =>
        AppRuntime.runPromise(
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

                yield* Effect.promise(() =>
                  stream.writeSSE({
                    data: JSON.stringify({ content: dueNote.content, noteId }),
                  }),
                );
              }
            }).pipe(
              // Intentional: catch defects per-poll so the fiber (and SSE
              // stream) survives transient failures (e.g. DB unavailable).
              // This preserves the current try/catch resilience semantics.
              // If fail-fast is ever preferred, remove this wrapper and let
              // the defect propagate — Effect.repeat will stop and the fiber
              // will die, leaving the stream open until the client reconnects.
              Effect.catchAllDefect((defect) =>
                Effect.logError("reminder polling failed", { defect }),
              ),
            );

            const fiber = yield* Effect.repeat(
              check,
              Schedule.spaced("30 seconds"),
            ).pipe(Effect.fork);

            yield* Effect.async<void>((resume) => {
              stream.onAbort(() => resume(Effect.void));
            });

            yield* Fiber.interrupt(fiber);
          }),
        ),
      );
    }),
  );
});
```

**Notes:**

- `Effect.repeat` runs `check` immediately then waits the interval — same behavior as the current `await check()` + `setInterval` pattern.
- The outer `Effect.gen` (userId fetch) does not need `catchAllDefect` — if `getDeviceUserId()` defects, the unhandled defect propagates to `AppRuntime.runPromise` which rejects the promise and Hono returns a 500 automatically.
- The `catchAllDefect` on `check` passes `defect` as a structured annotation object (`{ defect }`) rather than a bare second argument, so the Effect logger surfaces it as a labelled field alongside the message.
- Import `Fiber` and `Schedule` from `"effect"` alongside `Effect`.

## Additional: fix unsupervised `Effect.runFork` calls

Three fire-and-forget link-sync calls in the service layer use bare `Effect.runFork`
instead of `AppRuntime.runFork`, running outside the managed runtime with no supervision:

- `src/server/services/note-service.ts` (2 calls — after `create` and `update`)
- `src/server/services/import-service.ts` (1 call — after each imported note)

**Fix:** Replace `Effect.runFork(...)` with `AppRuntime.runFork(...)` at all three sites.
This ensures the forked fibers run inside the managed runtime, inherit its logger and
context, and are properly tracked.

**Note:** The Effects passed to `runFork` are already fully provided (the link service is
resolved via the outer `Effect.gen` scope), so no Layer changes are needed — only the
call site changes.

## Files Changed

- `src/api/assets/assets.http.ts`
- `src/api/export/export.http.ts`
- `src/api/reminders/reminders.http.ts`
- `src/server/services/note-service.ts`
- `src/server/services/import-service.ts`

## Verification

```bash
pnpm knip
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
