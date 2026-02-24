# Reminders: Overdue Filter

Replace fire-and-forget toast notifications with a persistent reminders flow using the existing notes page and a nav badge.

## Problem

Reminders currently rely on Sonner toasts as the sole notification mechanism:

- **Ephemeral** -- toasts are designed for transient feedback, not persistent notifications
- **Fire-and-forget** -- the SSE stream clears `remindAt` immediately after sending the event, so if the user misses the toast (different tab, browser closed, dismissed accidentally), the reminder is gone forever
- **No history** -- no way to see which reminders have fired
- **No visibility when away** -- if the tab isn't active, the reminder silently disappears from the DB

## Solution

Derive "fired/overdue" state from the existing `remindAt` column (`remindAt IS NOT NULL AND remindAt <= now()`) instead of adding a new column. Show overdue reminders as a filter on the existing notes page (`/notes?remind=overdue`) with a bell badge in the nav for visibility.

### Core flow

1. Reminder time passes -- SSE detects it, sends a brief auto-dismissing toast (5s) as a hint, **does not clear `remindAt`**
2. Bell icon in nav shows a dot badge when overdue reminders exist
3. Click bell -- navigates to `/notes?remind=overdue`
4. Notes page shows only notes with `remindAt <= now()`
5. Click a note -- view it -- `clearReminder` fires on page load -- reminder dismissed
6. Badge clears once all overdue reminders are viewed

### Key design decisions

- **No schema changes** -- "overdue" is derived from `remindAt` being in the past
- **No new pages** -- reuses the existing notes page with a query param filter
- **Toast kept as secondary hint** -- auto-dismissing (5s), not the primary notification
- **Dismissal = viewing the note** -- no separate "dismiss" button needed
- **`remind=overdue` param** -- extensible (could add `remind=upcoming` later)

## Technical Design

### SSE Stream Dedup

Since `remindAt` is no longer cleared on fire, `findDueReminders` returns the same notes every 30s poll cycle. Use an in-memory `Set<string>` per SSE connection to prevent duplicate toasts:

```ts
const notified = new Set<string>();

async function check() {
  const dueNotes = await noteService.getDueReminders(userId);
  for (const note of dueNotes) {
    if (notified.has(note.id)) continue;
    notified.add(note.id);
    send(
      `data: ${JSON.stringify({ content: note.content, noteId: note.id })}\n\n`,
    );
  }
}
```

If the user refreshes the page, a new SSE connection starts and the toast fires once more -- acceptable since the user may have missed it.

### Repository: `findMany` Filter

Add `remind?: "overdue"` to `NoteFilters`. When `remind === "overdue"`:

```ts
const remindFilter =
  filters.remind === "overdue"
    ? [isNotNull(note.remindAt), lte(note.remindAt, new Date())]
    : [];
```

### Repository: `countOverdueReminders`

New method for the nav badge count:

```ts
async countOverdueReminders(userId: string): Promise<number> {
  const [{ count: c }] = await this.db
    .select({ count: count() })
    .from(note)
    .where(
      and(
        eq(note.userId, userId),
        isNotNull(note.remindAt),
        lte(note.remindAt, new Date()),
      ),
    );
  return c;
}
```

### Search Params

Add `remind` parser to `src/lib/notes-search-params.ts`:

```ts
remind: parseAsStringEnum(["overdue"]).withDefault(""),
```

### Nav Badge

New `NavReminders` component following the `NavSettings` pattern:

- `BellIcon` + "reminders" label + `Kbd m`
- Dot badge when `count > 0`
- Links to `/notes?remind=overdue`
- `SiteNav` (server component) fetches the count and passes it as a prop

### Auto-Dismiss on Note Detail

In `src/app/notes/[id]/page.tsx`, after fetching the note:

```ts
if (note.remindAt && note.remindAt <= new Date()) {
  void clearReminder(noteId);
}
```

Fire-and-forget -- does not block rendering.

### Notes Filters UI

When `remind === "overdue"`, show a "reminders" indicator with a clear-filter link instead of the time/sort dropdowns. Keeps the UI focused on the overdue list.

## Files Changed

| Action | File                                         | Change                                                                                                      |
| ------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Edit   | `src/server/repositories/note-repository.ts` | Add `remind` to `NoteFilters`, `remindFilter` in `findMany`, add `countOverdueReminders` method + interface |
| Edit   | `src/server/services/note-service.ts`        | Add `countOverdueReminders` method                                                                          |
| Edit   | `src/app/api/reminders/stream/route.ts`      | Remove `clearReminder` call, add in-memory dedup `Set`                                                      |
| Edit   | `src/components/reminder-checker.tsx`        | Change toast `duration: Infinity` to `5000`                                                                 |
| Edit   | `src/lib/notes-search-params.ts`             | Add `remind` parser                                                                                         |
| Edit   | `src/actions/get-notes.ts`                   | Destructure and pass `remind` filter                                                                        |
| Edit   | `src/app/notes/page.tsx`                     | Handle `remind=overdue` in empty state message                                                              |
| Edit   | `src/components/notes/notes-filters.tsx`     | Show "reminders" indicator when `remind=overdue`                                                            |
| Edit   | `src/app/notes/[id]/page.tsx`                | Auto-dismiss overdue reminder on page load                                                                  |
| Edit   | `src/components/site-nav.tsx`                | Fetch overdue count, render `NavReminders`                                                                  |
| Edit   | `src/components/hotkeys-provider.tsx`        | Register `m` hotkey                                                                                         |
| Create | `src/actions/get-fired-reminders-count.ts`   | `"use cache"` action returning overdue count                                                                |
| Create | `src/components/nav-reminders.tsx`           | Bell icon nav link with badge                                                                               |

## Files Not Changed

| File                                       | Reason                                                      |
| ------------------------------------------ | ----------------------------------------------------------- |
| `src/server/db/schemas/notes.ts`           | No schema changes -- state derived from existing `remindAt` |
| `src/components/notes/reminder-button.tsx` | Works as-is -- set/clear reminder UX unchanged              |
| `src/actions/clear-reminder.ts`            | Reused for dismissal on note detail page                    |
| `src/actions/set-reminder.ts`              | Unchanged                                                   |

## Validation

```sh
pnpm db:push       # no-op, but confirm no schema drift
pnpm typecheck
pnpm test           # fix any broken tests
pnpm lint:fix
pnpm format:fix
pnpm build
pnpm knip
```
