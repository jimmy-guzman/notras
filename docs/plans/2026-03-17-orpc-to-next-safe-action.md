# Migrate oRPC → next-safe-action

Replace `@orpc/server` + `@orpc/react` with `next-safe-action` across all mutation server actions and client components. Read actions (plain async functions, RSC-only) are untouched.

## Background

### Why oRPC is wrong here

The codebase uses Effect-TS as the true server framework: typed errors, Layer/DI via `Context.Tag`, Effect Schema for validation, and `ManagedRuntime` for execution. Every oRPC handler body immediately delegates to `AppRuntime.runPromise(...)` — oRPC itself never touches business logic.

This creates an awkward seam repeated 16 times:

```ts
// current pattern — oRPC is pure ceremony
export const deleteNote = authedProcedure
  .input(Schema.standardSchemaV1(deleteNoteSchema))
  .handler(async ({ context, input }) => {
    await AppRuntime.runPromise(
      // ← Effect does all the work
      NoteService.pipe(
        Effect.flatMap((svc) => svc.delete(context.userId, input.noteId)),
      ),
    );
    updateTag("notes");
  })
  .actionable();
```

Additional friction points:

- `Schema.standardSchemaV1()` is needed to bridge Effect Schema into oRPC's input API
- The `authedProcedure` middleware runs `AppRuntime.runPromise(UserService.getDeviceUserId())` — a DB round-trip — on every single action call to return the hardcoded string `"device"`
- `createFormAction` from `@orpc/react` is used to wrap two procedures for native `<form action>` submission; next-safe-action doesn't need a wrapper
- oRPC is a general RPC framework; the app only uses its server action adapter — 100% of the value is in the client hooks

### Why next-safe-action is correct

- Purpose-built for Next.js server actions — no RPC ceremony
- Native Standard Schema support: `Schema.standardSchemaV1()` passed directly to `.inputSchema()`, no extra bridging
- `useAction` / `useOptimisticAction` hooks cover the full client-side surface area
- Middleware for shared context (userId injection) — same pattern as `authedProcedure`
- `handleServerError` controls what error messages propagate to the client (replaces `ORPCError`)

### Vision note

This app is intended to grow significantly (tasks, AI, integrations). Effect-TS commitment is firm. next-safe-action is the right tool _for the server action layer_ specifically. When the app eventually needs a real API for external clients (mobile, CLI, agents), that goes through a separate Route Handler layer — not through server actions at all.

---

## Scope

### Changed

| Layer                                  | What changes                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/lib/orpc.ts`                      | Deleted. Replaced by `src/lib/safe-action.ts`.                                                                    |
| 14 mutation actions (`*.actionable()`) | New client, `context` → `ctx`, `[error, data]` tuple → result object                                              |
| 2 form actions (`createFormAction`)    | Drop wrapper, `redirect()` stays in handler, same schema/logic                                                    |
| 13 client components                   | `useServerAction` → `useAction`, `useOptimisticServerAction` → `useOptimisticAction`, interceptors → hook options |
| `FormHotkeys` prop type                | Broaden `action` from `Promise<void>` to `Promise<unknown>`                                                       |
| `package.json`                         | Add `next-safe-action`, remove `@orpc/server` + `@orpc/react`                                                     |

### Unchanged

- All 11 read actions (`get-notes.ts`, `get-note.ts`, etc.) — plain async functions, RSC-only, no oRPC
- All Effect services, repositories, and the `AppRuntime`
- All schemas in `src/server/schemas/`
- All react-hook-form + `standardSchemaV1` wiring
- Route handlers (`/api/assets`, `/api/export`, `/api/reminders/stream`)

---

## API Mapping

### Action client

```ts
// BEFORE: src/lib/orpc.ts
import { os } from "@orpc/server";
import { Effect } from "effect";
import { AppRuntime } from "@/server/layer";
import { UserService } from "@/server/services/user-service";

export const authedProcedure = os.use(async ({ next }) => {
  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );
  return next({ context: { userId } });
});
```

```ts
// AFTER: src/lib/safe-action.ts
import { createSafeActionClient } from "next-safe-action";

const actionClient = createSafeActionClient({
  handleServerError(e) {
    return e.message;
  },
});

export const authActionClient = actionClient.use(async ({ next }) => {
  return next({ ctx: { userId: "device" } });
});
```

`userId` is hardcoded to `"device"` — this is intentionally simpler than the current DB round-trip, since the app is permanently single-user until real auth is built. When auth arrives, swap the middleware in one place.

### Standard `.actionable()` mutations

```ts
// BEFORE
export const deleteNote = authedProcedure
  .input(Schema.standardSchemaV1(deleteNoteSchema))
  .handler(async ({ context, input }) => {
    await AppRuntime.runPromise(...);
    updateTag("notes");
  })
  .actionable();

// Client destructures: const [error, result] = await deleteNote(input)
```

```ts
// AFTER
export const deleteNote = authActionClient
  .inputSchema(Schema.standardSchemaV1(deleteNoteSchema))
  .action(async ({ parsedInput, ctx }) => {
    await AppRuntime.runPromise(...);
    updateTag("notes");
  });

// Client: const result = await deleteNote(input)
// Check: if (result?.serverError) { ... }
```

Key diffs:

- `.handler()` → `.action()`
- `context.userId` → `ctx.userId`
- `input` → `parsedInput`
- No `.actionable()` call — the `.action()` return is the server action directly
- Result is an object `{ data?, serverError?, validationErrors? }`, not a `[error, data]` tuple

### `createFormAction` pattern (create-note, update-note)

```ts
// BEFORE — requires createFormAction wrapper
const createNoteProcedure = authedProcedure
  .input(Schema.standardSchemaV1(schema))
  .handler(async ({ context, input }) => {
    // ...
    redirect(`/notes/${id}`);
  });

export const createNote = createFormAction(createNoteProcedure);
```

```ts
// AFTER — redirect() in handler directly, no wrapper
export const createNote = authActionClient
  .inputSchema(Schema.standardSchemaV1(schema))
  .action(async ({ parsedInput, ctx }) => {
    // ...
    redirect(`/notes/${id}`);
  });
```

`redirect()` throws a special Next.js framework error. next-safe-action detects it and re-throws so Next.js handles the navigation. No wrapper needed.

`FormHotkeys` accepts `action: (formData: FormData) => Promise<void> | void`. A next-safe-action action returns `Promise<SafeActionResult>`, not `Promise<void>`. The prop type must be broadened to `Promise<unknown> | void` — the return value is never used by `FormHotkeys`.

### Error propagation (import-notes.ts)

`import-notes.ts` is the only action that throws an expected error with a client-visible message. Currently uses `ORPCError` from `@orpc/server`.

```ts
// BEFORE
throw new ORPCError("BAD_REQUEST", {
  message: "No valid notes found in the import file.",
});

// AFTER
throw new Error("No valid notes found in the import file.");
```

The `handleServerError` in the action client returns `e.message`, so the message propagates to `result?.serverError` on the client — same observable behavior.

### Client hook mapping

```ts
// BEFORE
import { onErrorDeferred, onSuccessDeferred } from "@orpc/react";
import { useServerAction } from "@orpc/react/hooks";

const action = useServerAction(deleteNote);

// interceptors called around execute():
await action.execute(input, {
  interceptors: [
    onSuccessDeferred(() => {
      toast.success("deleted");
    }),
    onErrorDeferred(({ error }) => {
      toast.error(error.message);
    }),
  ],
});
```

```ts
// AFTER
import { useAction } from "next-safe-action/hooks";

const action = useAction(deleteNote, {
  onSuccess: () => {
    toast.success("deleted");
  },
  onError: ({ error }) => {
    toast.error(error.serverError ?? "something went wrong");
  },
});

// call site:
action.execute(input);
```

| oRPC                                              | next-safe-action                                    |
| ------------------------------------------------- | --------------------------------------------------- |
| `useServerAction`                                 | `useAction`                                         |
| `useOptimisticServerAction`                       | `useOptimisticAction`                               |
| `action.isPending`                                | `action.isPending` (same)                           |
| `action.execute(input, { interceptors: [...] })`  | `action.execute(input)` (callbacks in hook options) |
| `onSuccessDeferred(() => ...)` interceptor        | `onSuccess: () => ...` hook option                  |
| `onErrorDeferred(({ error }) => ...)` interceptor | `onError: ({ error }) => ...` hook option           |
| `onFinishDeferred(() => ...)` interceptor         | `onSettled: () => ...` hook option                  |
| `error.message`                                   | `error.serverError`                                 |

### Optimistic action mapping

`pin-note-button.tsx` and `note-actions.tsx` both use **two separate** `useOptimisticServerAction` instances — one for `pinNote`, one for `unpinNote` — and derive the displayed state by checking both `.isPending` values:

```ts
const optimisticPinned = pinAction.isPending
  ? pinAction.optimisticState
  : unpinAction.isPending
    ? unpinAction.optimisticState
    : pinned;
```

This two-instance pattern maps directly to two `useOptimisticAction` calls. `updateFn` for each is a constant — the input only carries `noteId`, not a `pinned` field:

```ts
// BEFORE
const pinAction = useOptimisticServerAction(pinNote, {
  interceptors: [onErrorDeferred(() => toast.error(...))],
  optimisticPassthrough: pinned,
  optimisticReducer: () => true,
});
const unpinAction = useOptimisticServerAction(unpinNote, {
  interceptors: [onErrorDeferred(() => toast.error(...))],
  optimisticPassthrough: pinned,
  optimisticReducer: () => false,
});
```

```ts
// AFTER
const pinAction = useOptimisticAction(pinNote, {
  currentState: { pinned },
  updateFn: () => ({ pinned: true }),
  onError: ({ error }) => {
    toast.error(error.serverError ?? "failed to pin note. please try again.");
  },
});
const unpinAction = useOptimisticAction(unpinNote, {
  currentState: { pinned },
  updateFn: () => ({ pinned: false }),
  onError: ({ error }) => {
    toast.error(error.serverError ?? "failed to unpin note. please try again.");
  },
});
```

`optimisticState` on each action is `{ pinned: boolean }`. The derived display state logic is unchanged. On failure, `optimisticState` reverts to `currentState` automatically.

---

## Affected Files

### Action files (16)

| File                     | Current pattern               | Migration                                   |
| ------------------------ | ----------------------------- | ------------------------------------------- |
| `create-note.ts`         | `createFormAction`            | Drop wrapper, `redirect()` stays in handler |
| `update-note.ts`         | `createFormAction`            | Drop wrapper, `redirect()` stays in handler |
| `delete-note.ts`         | `.actionable()`               | Standard migration                          |
| `pin-note.ts`            | `.actionable()`               | Standard migration                          |
| `unpin-note.ts`          | `.actionable()`               | Standard migration                          |
| `move-note-to-folder.ts` | `.actionable()`               | Standard migration                          |
| `import-notes.ts`        | `.actionable()` + `ORPCError` | Standard migration + `throw new Error()`    |
| `create-folder.ts`       | `.actionable()`               | Standard migration                          |
| `rename-folder.ts`       | `.actionable()`               | Standard migration                          |
| `delete-folder.ts`       | `.actionable()`               | Standard migration                          |
| `upload-assets.ts`       | `.actionable()`               | Standard migration                          |
| `delete-asset.ts`        | `.actionable()`               | Standard migration                          |
| `set-reminder.ts`        | `.actionable()`               | Standard migration                          |
| `clear-reminder.ts`      | `.actionable()`               | Standard migration                          |
| `update-profile.ts`      | `.actionable()`               | Standard migration                          |
| `update-preferences.ts`  | `.actionable()`               | Standard migration                          |

### Client components (13)

| File                               | oRPC hooks used                                           | Notes                              |
| ---------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| `notes/delete-note-button.tsx`     | `useServerAction`, `onErrorDeferred`, `onSuccessDeferred` | Standard                           |
| `notes/reminder-button.tsx`        | `useServerAction`, `onErrorDeferred`, `onSuccessDeferred` | Per-call interceptors — see note   |
| `notes/pin-note-button.tsx`        | `useOptimisticServerAction`, `onErrorDeferred`            | Two-instance optimistic — see note |
| `notes/note-actions.tsx`           | `useOptimisticServerAction`, `onErrorDeferred`            | Two-instance optimistic — see note |
| `notes/note-drop-panel.tsx`        | `useServerAction`, `onErrorDeferred`, `onSuccessDeferred` | Standard                           |
| `notes/assets/asset-uploader.tsx`  | `useServerAction`, `onErrorDeferred`                      | `executeAsync` — see note          |
| `notes/assets/use-delete-asset.ts` | `useServerAction`, `onErrorDeferred`, `onFinishDeferred`  | `onFinishDeferred` → `onSettled`   |
| `folders/create-folder-button.tsx` | `useServerAction`, `onErrorDeferred`, `onSuccessDeferred` | Standard                           |
| `folders/rename-folder-button.tsx` | `useServerAction`, `onErrorDeferred`, `onSuccessDeferred` | Standard                           |
| `folders/delete-folder-button.tsx` | `useServerAction`, `onErrorDeferred`                      | Standard                           |
| `settings/profile-form.tsx`        | `useServerAction`, `onErrorDeferred`, `onSuccessDeferred` | Standard                           |
| `settings/preferences-form.tsx`    | `useServerAction`, `onErrorDeferred`, `onSuccessDeferred` | Standard                           |
| `settings/import-notes.tsx`        | `useServerAction`, `onErrorDeferred`, `onSuccessDeferred` | `isSuccess` rename — see note      |

### Other files

| File                                    | Change                                                        |
| --------------------------------------- | ------------------------------------------------------------- |
| `src/components/notes/form-hotkeys.tsx` | Broaden `action` prop: `Promise<void>` → `Promise<unknown>`   |
| `src/lib/orpc.ts`                       | Delete                                                        |
| `src/lib/safe-action.ts`                | Create (new action client)                                    |
| `package.json`                          | Add `next-safe-action`, remove `@orpc/server` + `@orpc/react` |

---

## Implementation Notes

### `reminder-button.tsx` — per-call interceptors

oRPC supports per-call interceptors on `execute()`. `setReminderAction` and `clearReminderAction` each pass a per-call `onSuccessDeferred` that calls `decrement()` (overdue counter) only when the reminder being replaced was already overdue. `isOverdue` is computed from `remindAt` at the call site.

`next-safe-action` has no per-call callbacks — `onSuccess` is hook-level only. Fix: capture `isOverdue` in a `useRef` immediately before calling `execute()`, then read it inside the `onSuccess` hook option:

```ts
const isOverdueRef = useRef(false);
const setReminderAction = useAction(setReminder, {
  onSuccess: ({ data }) => {
    toast.success(`reminder set for ${formatDateTime(data.remindAt)}`);
    if (isOverdueRef.current) decrement();
  },
  onError: ({ error }) => {
    toast.error(
      error.serverError ?? "failed to set reminder. please try again.",
    );
  },
});

// in handleSetReminder:
isOverdueRef.current = remindAt !== null && remindAt <= new Date();
setReminderAction.execute({ noteId, preset });
```

Same pattern for `clearReminderAction`.

### `asset-uploader.tsx` — `execute` returns `void`

The component chains `.then()` on `execute()` to clear the file input on success:

```ts
void action.execute({ files: fileArray, noteId }).then((result) => {
  if (!result.error && fileInputRef.current) {
    fileInputRef.current.value = "";
  }
});
```

In `next-safe-action`, `execute()` returns `void`. Use `executeAsync()` instead, which returns `Promise<SafeActionResult>`. `uploadAssets` does not call `redirect()` so the promise will not throw:

```ts
void action.executeAsync({ files: fileArray, noteId }).then((result) => {
  if (!result?.serverError && fileInputRef.current) {
    fileInputRef.current.value = "";
  }
});
```

### `import-notes.tsx` — `isSuccess` → `hasSucceeded`

The component uses `action.isSuccess` in a `useEffect` to reset the form after a successful import. In `next-safe-action` this boolean is named `hasSucceeded`. `action.reset()` exists with the same name.

```ts
// BEFORE
if (action.isSuccess) { ... }

// AFTER
if (action.hasSucceeded) { ... }
```

---

## Execution Steps

1. **Install / uninstall packages** — `pnpm add next-safe-action`, `pnpm remove @orpc/server @orpc/react`
2. **Create `src/lib/safe-action.ts`** — new action client with `handleServerError` + device userId middleware
3. **Migrate 14 standard `.actionable()` actions** — swap client, rename `context` → `ctx`, `input` → `parsedInput`, drop `.actionable()`
4. **Migrate 2 `createFormAction` actions** — drop wrapper, use `.action()` directly with `redirect()` in handler
5. **Update `FormHotkeys`** — broaden `action` prop type
6. **Migrate 11 standard `useServerAction` components** — swap hook, move interceptors into hook options
7. **Migrate 2 optimistic components** (`pin-note-button`, `note-actions`) — swap `useOptimisticServerAction` → `useOptimisticAction`
8. **Migrate `use-delete-asset.ts`** — `onFinishDeferred` → `onSettled`
9. **Delete `src/lib/orpc.ts`**
10. **Verify** — `pnpm knip && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
