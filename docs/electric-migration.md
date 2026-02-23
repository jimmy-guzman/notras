# Electric SQL + TanStack DB Migration Plan

Migrate notras from server-fetched data (RSC + `"use cache"` + `cacheTag`) to a local-first architecture using Electric SQL for real-time Postgres sync and TanStack DB for client-side reactive queries and optimistic mutations.

## Why Electric SQL + TanStack DB

- **Offline support** -- notes are available instantly from a local in-memory store, no network required.
- **Instant reads/writes** -- all queries run against the local collection (sub-millisecond). Mutations apply optimistically and sync in the background.
- **Multi-device sync** -- Electric streams Postgres WAL changes to every connected client. Open two tabs, edits appear immediately.
- **Simplicity** -- Electric is a read-path sync primitive (no custom conflict resolution server). Writes go through our existing server actions. TanStack DB wires it all together with a reactive query engine.

### What was rejected

| Solution                | Reason                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| PowerSync               | UI is bad (red flag), overly complex setup                        |
| Zero                    | Not truly local-first -- server-authoritative with client caching |
| Turso embedded replicas | Server-side only, no browser offline support                      |

## Architecture Overview

```
Browser                          Server                    Database
---------                        --------                  ----------

TanStack DB Collection           Next.js API Route         Neon PostgreSQL
  - Local in-memory store   <--  /api/notes-shape    <--   (logical replication)
  - useLiveQuery (reads)         (auth + proxy)             |
  - collection.insert/                                      | Electric Cloud
    update/delete (writes)  -->  Server Actions      -->    | (streams WAL)
                                 (authorizedServerAction)   |
                                 db.transaction()           |
                                 pg_current_xact_id()       |
                                 return { txid }      ----> synced back via shape
```

**Read path:** Electric Cloud streams the `note` table (filtered by `user_id`) into a TanStack DB collection via an authenticated shape proxy. Components use `useLiveQuery` for reactive, sub-millisecond local queries.

**Write path:** Mutations call `collection.insert()` / `.update()` / `.delete()` which apply optimistically to the local store, then invoke server action handlers that persist to Postgres inside a transaction and return `{ txid }`. TanStack DB waits for that txid to appear in the Electric stream before confirming the mutation.

## Decisions

### 1. txid over awaitMatch

The `txid` approach is TanStack DB's recommended sync confirmation pattern. Mutation handlers return `{ txid }` (from `pg_current_xact_id()::xid::text`), and TanStack DB waits for that specific transaction ID to appear in the Electric shape stream. This is more robust than `awaitMatch` (deterministic, multi-device safe, batch-mutation safe).

**Implication:** Requires switching from `neon-http` (stateless, no transactions) to `neon-serverless` (WebSocket-based, supports `db.transaction()`), since `pg_current_xact_id()` must run inside the same `BEGIN`/`COMMIT` block as the mutation.

### 2. Granular `"use client"` boundaries

Components that use `useLiveQuery` need `"use client"`, but we keep boundaries as tight as possible. Layouts and pages remain server components. Only leaf components that consume the collection become client components.

### 3. Electric Cloud (managed hosting)

Use Electric Cloud for now (no self-hosting). Create a source that points to Neon's direct (non-pooled) connection string.

---

## Phase 0 -- Infrastructure Setup

**Goal:** Install packages, configure env vars, switch DB driver, enable Neon logical replication, set up Electric Cloud.

### 0.1 Enable Neon Logical Replication

In the Neon dashboard:

1. Go to **Project Settings > Beta**.
2. Enable **Logical Replication**.
3. Copy the **direct** (non-pooled) connection string -- Electric needs a persistent connection, not a pooled one.

### 0.2 Set Up Electric Cloud

1. Go to [electric-sql.com](https://electric-sql.com) and create an account.
2. Create a new **Source** pointing to the Neon direct connection string.
3. Note the Electric Cloud URL and Source ID.
4. Optionally create an auth token if using Electric's auth layer.

### 0.3 Install Packages

```sh
pnpm add @tanstack/react-db @tanstack/electric-db-collection @electric-sql/client
pnpm add ws bufferutil
```

- `@tanstack/react-db` -- TanStack DB core + React bindings (`useLiveQuery`).
- `@tanstack/electric-db-collection` -- Electric-backed collection (`electricCollectionOptions`).
- `@electric-sql/client` -- Electric client library (shape protocol).
- `ws` + `bufferutil` -- WebSocket support for `@neondatabase/serverless` in Node.js (required for `db.transaction()`).

### 0.4 Add Environment Variables

```diff
// src/env.ts
server: {
  BETTER_AUTH_SECRET: z.string(),
  DATABASE_URL: z.string(),
+ ELECTRIC_URL: z.string(),
+ ELECTRIC_SOURCE_ID: z.string(),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  PORT: z.string().optional().default(DEFAULT_PORT),
  RESEND_API_KEY: z.string(),
  RESEND_FROM_EMAIL: z.string(),
},
```

Add to `.env.local`:

```env
ELECTRIC_URL=https://your-instance.electric-sql.com
ELECTRIC_SOURCE_ID=your-source-id
```

### 0.5 Switch DB Driver

Switch from stateless `neon-http` to WebSocket-based `neon-serverless` to support transactions (needed for txid).

**Before** (`src/server/db/index.ts`):

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/env";

import * as notes from "./schemas/notes";
import * as users from "./schemas/users";

const schema = {
  ...users,
  ...notes,
};

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);

  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;

export const db = createDb(env.DATABASE_URL);
```

**After:**

```ts
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { env } from "@/env";

import * as notes from "./schemas/notes";
import * as users from "./schemas/users";

const schema = {
  ...users,
  ...notes,
};

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });

  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof createDb>;

export const db = createDb(env.DATABASE_URL);
```

Key changes:

- `neon()` -> `Pool` (WebSocket pool, supports transactions)
- `drizzle-orm/neon-http` -> `drizzle-orm/neon-serverless`
- The Drizzle API surface (`db.select()`, `db.insert()`, etc.) is identical -- no downstream changes needed.
- `db.transaction()` now works, which is required for `pg_current_xact_id()`.

### 0.6 Verify

After Phase 0, run:

```sh
pnpm typecheck  # No type errors
pnpm test       # All 47 tests pass
pnpm build      # Clean build
```

The app should function identically. The driver switch is a non-breaking infrastructure change.

---

## Phase 1 -- Shape Proxy API Route

**Goal:** Create an authenticated API route that proxies Electric shape requests, ensuring users can only sync their own notes.

### Why a proxy

Electric shapes are public HTTP endpoints. Without a proxy, any client could request any user's notes by guessing `user_id`. The proxy:

1. Validates auth via `getSession()`.
2. Hardcodes `table = "note"` and `where = "user_id = '${userId}'"` server-side.
3. Forwards Electric protocol query params (`offset`, `handle`, `live`, `cursor`).

### Implementation

Create `src/app/api/notes-shape/route.ts`:

```ts
import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { env } from "@/env";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(`${env.ELECTRIC_URL}/v1/shape`);

  url.searchParams.set("source_id", env.ELECTRIC_SOURCE_ID);
  url.searchParams.set("table", "note");
  url.searchParams.set("where", `user_id = '${session.user.id}'`);

  // Forward Electric protocol params from the client
  for (const key of ["offset", "handle", "live", "cursor"]) {
    const value = request.nextUrl.searchParams.get(key);

    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString());

  return new NextResponse(response.body, {
    headers: {
      "cache-control": "no-store",
      "content-type":
        response.headers.get("content-type") ?? "application/json",
      ...(response.headers.get("electric-handle")
        ? { "electric-handle": response.headers.get("electric-handle")! }
        : {}),
      ...(response.headers.get("electric-offset")
        ? { "electric-offset": response.headers.get("electric-offset")! }
        : {}),
    },
    status: response.status,
  });
}
```

### Verify

With the dev server and Electric Cloud both running:

```sh
curl -s http://localhost:3000/api/notes-shape | head -c 200
# Should return shape data (or empty array for a new user)
# Without auth, should return 401
```

---

## Phase 2 -- Notes Collection + Provider

**Goal:** Create the TanStack DB notes collection with Electric sync, Zod schema, and mutation handlers that call existing server actions.

### 2.1 Notes Collection

Create `src/collections/notes.ts`:

```ts
"use client";

import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { Collection } from "@tanstack/react-db";
import { z } from "zod";

const noteSchema = z.object({
  content: z.string(),
  created_at: z.string(),
  id: z.string(),
  pinned_at: z.string().nullable(),
  updated_at: z.string(),
  user_id: z.string(),
});

export type ClientNote = z.infer<typeof noteSchema>;

export const notesCollection = new Collection(
  electricCollectionOptions({
    getKey: (note: ClientNote) => note.id,
    onDelete: async (deletes) => {
      const response = await fetch("/api/notes/mutations", {
        body: JSON.stringify({
          ids: deletes.map((d) => d.value.id),
          type: "delete",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const { txid } = (await response.json()) as { txid: string };

      return { txid };
    },
    onInsert: async (inserts) => {
      const response = await fetch("/api/notes/mutations", {
        body: JSON.stringify({
          notes: inserts.map((i) => i.value),
          type: "insert",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const { txid } = (await response.json()) as { txid: string };

      return { txid };
    },
    onUpdate: async (updates) => {
      const response = await fetch("/api/notes/mutations", {
        body: JSON.stringify({
          type: "update",
          updates: updates.map((u) => ({
            changes: u.changes,
            id: u.value.id,
          })),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const { txid } = (await response.json()) as { txid: string };

      return { txid };
    },
    schema: noteSchema,
    shapeOptions: {
      url: "/api/notes-shape",
    },
  }),
);
```

**Key details:**

- Column names use **snake_case** (`created_at`, `pinned_at`, etc.) because Electric streams raw Postgres column names, not Drizzle's camelCase mappings.
- `getKey` returns the `id` field (TypeID string, e.g., `note_01h2xcejqtf2nbrexx3vqjhp41`).
- Mutation handlers (`onInsert`, `onUpdate`, `onDelete`) call a dedicated mutations API route instead of server actions directly, because server actions use FormData and `"use server"` context which doesn't fit the TanStack DB handler signature.
- All handlers return `{ txid }` for sync confirmation.

### 2.2 Mutations API Route

Create `src/app/api/notes/mutations/route.ts` to handle mutations from the collection handlers:

```ts
import type { NextRequest } from "next/server";

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import invariant from "tiny-invariant";

import type { NoteId } from "@/lib/id";

import { getSession } from "@/lib/auth";
import { toNoteId } from "@/lib/id";
import { db } from "@/server/db";
import { getNoteService } from "@/server/services/note-service";

async function withTxId<T>(
  fn: (userId: string) => Promise<T>,
): Promise<{ txid: string }> {
  const session = await getSession();

  invariant(session, "Unauthorized");

  const txid = await db.transaction(async (tx) => {
    await fn(session.user.id);

    const [{ txid: id }] = await tx.execute<{ txid: string }>(
      sql`SELECT pg_current_xact_id()::text as txid`,
    );

    return id;
  });

  return { txid };
}

interface InsertBody {
  notes: Array<{ content: string; id: string }>;
  type: "insert";
}

interface UpdateBody {
  type: "update";
  updates: Array<{
    changes: Record<string, unknown>;
    id: string;
  }>;
}

interface DeleteBody {
  ids: string[];
  type: "delete";
}

type MutationBody = DeleteBody | InsertBody | UpdateBody;

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as MutationBody;
  const service = getNoteService();

  switch (body.type) {
    case "delete": {
      const result = await withTxId(async (userId) => {
        for (const id of body.ids) {
          await service.delete(userId, toNoteId(id));
        }
      });

      return NextResponse.json(result);
    }

    case "insert": {
      const result = await withTxId(async (userId) => {
        for (const note of body.notes) {
          await service.create(userId, note.content);
        }
      });

      return NextResponse.json(result);
    }

    case "update": {
      const result = await withTxId(async (userId) => {
        for (const update of body.updates) {
          const noteId = toNoteId(update.id);

          if (typeof update.changes.content === "string") {
            await service.update(userId, noteId, update.changes.content);
          }

          if (update.changes.pinned_at !== undefined) {
            if (update.changes.pinned_at) {
              await service.pin(userId, noteId);
            } else {
              await service.unpin(userId, noteId);
            }
          }
        }
      });

      return NextResponse.json(result);
    }

    default: {
      return NextResponse.json(
        { error: "Unknown mutation type" },
        { status: 400 },
      );
    }
  }
}
```

### 2.3 Notes Provider

Create `src/components/providers/notes-provider.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";

import { useEffect, useState } from "react";

import { notesCollection } from "@/collections/notes";

export function NotesProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Collection starts syncing on mount
    setIsReady(true);
  }, []);

  if (!isReady) return null;

  return <>{children}</>;
}
```

Wire it into the notes layout (`src/app/notes/layout.tsx`) or a higher-level authenticated layout.

### Verify

```sh
pnpm typecheck
pnpm lint
```

At this point the collection exists but no components consume it yet. The app still works via server-fetched data.

---

## Phase 3 -- Migrate Read Path

**Goal:** Convert components from server-fetched props (`notes: SelectNote[]`) to `useLiveQuery` against the local collection.

### Key concept

`useLiveQuery` runs against the in-memory collection, not the server. Filtering, sorting, and searching become sub-millisecond local operations. Components that use `useLiveQuery` must be client components.

### Column name mapping

Electric streams raw Postgres column names (snake_case), not Drizzle's camelCase:

| Drizzle (camelCase) | Postgres / Electric (snake_case) |
| ------------------- | -------------------------------- |
| `note.id`           | `id`                             |
| `note.content`      | `content`                        |
| `note.userId`       | `user_id`                        |
| `note.createdAt`    | `created_at`                     |
| `note.updatedAt`    | `updated_at`                     |
| `note.pinnedAt`     | `pinned_at`                      |

Components will use the snake_case `ClientNote` type from the collection.

### 3.1 Notes List Page (`src/app/notes/page.tsx`)

**Before:** Server component that awaits `getNotes()` and passes data as props.

**After:** Server component renders a client `<NotesListView />` that uses `useLiveQuery` internally. The page itself stays a server component (for metadata, layout).

Create `src/components/notes/notes-list-view.tsx`:

```tsx
"use client";

import { useLiveQuery } from "@tanstack/react-db";

import { notesCollection } from "@/collections/notes";

import { AnimatedNoteCard } from "./animated-note-card";
import { NoteCard } from "./note-card";

export function NotesListView() {
  // Filters come from URL search params (nuqs), applied locally
  const { data: notes } = useLiveQuery((query) =>
    query
      .from({ notesCollection })
      .orderBy("@notesCollection.created_at", "desc")
      .select("@notesCollection"),
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {notes.map((note, index) => (
        <AnimatedNoteCard index={index} key={note.id}>
          <NoteCard note={note} />
        </AnimatedNoteCard>
      ))}
    </div>
  );
}
```

### 3.2 Home Page Recent Notes

Replace the server-fetched `recentNotes` with a client component that queries the collection:

```tsx
"use client";

import { useLiveQuery } from "@tanstack/react-db";

import { notesCollection } from "@/collections/notes";

export function RecentNotesView() {
  const { data: notes } = useLiveQuery((query) =>
    query
      .from({ notesCollection })
      .where("@notesCollection.pinned_at", "IS", null)
      .orderBy("@notesCollection.created_at", "desc")
      .limit(5)
      .select("@notesCollection"),
  );

  // ... render recent notes list
}
```

### 3.3 Note Detail Page (`src/app/notes/[id]/page.tsx`)

This page fetches a single note by ID. Convert to use the collection:

```tsx
"use client";

import { useLiveQuery } from "@tanstack/react-db";

import { notesCollection } from "@/collections/notes";

export function NoteDetailView({ noteId }: { noteId: string }) {
  const { data: note } = useLiveQuery((query) =>
    query
      .from({ notesCollection })
      .where("@notesCollection.id", "=", noteId)
      .select("@notesCollection")
      .findOne(),
  );

  if (!note) return <NotFound />;

  // ... render note detail
}
```

### 3.4 Notes Count

Currently uses `getNotesCount()` server action with `"use cache"`. Replace with:

```tsx
const { data: notes } = useLiveQuery((query) =>
  query.from({ notesCollection }).select("@notesCollection"),
);

const count = notes.length;
```

### 3.5 Search

Currently uses `ilike` on the server. Move to client-side filtering:

```tsx
const { data: notes } = useLiveQuery((query) => {
  let q = query.from({ notesCollection });

  if (searchQuery) {
    q = q.where("@notesCollection.content", "LIKE", `%${searchQuery}%`);
  }

  return q
    .orderBy("@notesCollection.created_at", "desc")
    .select("@notesCollection");
});
```

### 3.6 Filters (sort, time)

Currently driven by URL search params that trigger server re-fetches. Now applied locally:

```tsx
// Sort
switch (sort) {
  case "newest":
    q = q.orderBy("@notesCollection.created_at", "desc");
    break;
  case "oldest":
    q = q.orderBy("@notesCollection.created_at", "asc");
    break;
  case "updated":
    q = q.orderBy("@notesCollection.updated_at", "desc");
    break;
}

// Time filter
if (time !== "all") {
  const startDate = getStartDateForFilter(time).toISOString();
  q = q.where("@notesCollection.created_at", ">=", startDate);
}
```

### Verify

```sh
pnpm typecheck
pnpm lint
pnpm test  # Update tests to mock the collection instead of server actions
```

---

## Phase 4 -- Migrate Write Path

**Goal:** Convert mutations from direct server action calls to collection mutations. Optimistic updates apply instantly; the server persists in the background.

### 4.1 Create Note

**Before** (`src/app/notes/new/page.tsx`):

```tsx
<FormHotkeys action={createNote} cancelHref="/notes">
```

**After:**

```tsx
"use client";

import { useRouter } from "next/navigation";

import { notesCollection } from "@/collections/notes";
import { generateNoteId } from "@/lib/id";

function handleCreate(content: string) {
  const id = generateNoteId();
  const now = new Date().toISOString();

  notesCollection.insert({
    content,
    created_at: now,
    id,
    pinned_at: null,
    updated_at: now,
    user_id: "", // Filled by the server; Electric will sync the real value
  });

  router.push(`/notes/${id}`);
}
```

The insert applies optimistically (the note appears in the list immediately), then the `onInsert` handler persists to Postgres and returns `{ txid }`.

### 4.2 Update Note

**Before:**

```tsx
await updateNote(formData);
```

**After:**

```tsx
notesCollection.update(noteId, (draft) => {
  draft.content = newContent;
  draft.updated_at = new Date().toISOString();
});

router.push(`/notes/${noteId}`);
```

### 4.3 Delete Note

**Before:**

```tsx
await deleteNote(noteId);
router.push("/notes");
```

**After:**

```tsx
notesCollection.delete(noteId);
router.push("/notes");
```

### 4.4 Pin / Unpin

**Before:**

```tsx
await pinNote(noteId);
// or
await unpinNote(noteId);
```

**After:**

```tsx
notesCollection.update(noteId, (draft) => {
  draft.pinned_at = pinned ? null : new Date().toISOString();
  draft.updated_at = new Date().toISOString();
});
```

### 4.5 Error Handling

TanStack DB auto-rolls back optimistic state if a handler throws. Show a toast on failure:

```tsx
try {
  const tx = notesCollection.delete(noteId);
  await tx.isPersisted.promise;
} catch {
  toast.error("Failed to delete note. Please try again.");
}
```

Or use the `Transaction.state` for tracking:

```tsx
const tx = notesCollection.insert({ ... });
// tx.state is "pending" -> "persisted" or "failed"
```

### Verify

```sh
pnpm typecheck
pnpm lint
pnpm test
```

Test offline behavior: disconnect network, create/edit/delete notes, reconnect -- mutations should sync.

---

## Phase 5 -- Cleanup

**Goal:** Remove server-side caching and read-only server actions that are no longer needed.

### 5.1 Remove `"use cache"` + `cacheTag`

Delete from:

- `src/actions/get-notes.ts` -- `"use cache"` and `cacheTag("notes")` calls
- `src/actions/get-note.ts` -- `"use cache"` and `cacheTag("notes", id)` calls

### 5.2 Remove `updateTag` Calls

Delete from:

- `src/actions/create-note.ts` -- `updateTag("notes")`
- `src/actions/update-note.ts` -- `updateTag("notes")`
- `src/actions/delete-note.ts` -- `updateTag("notes")`
- `src/actions/pin-note.ts` -- `updateTag("notes")`
- `src/actions/unpin-note.ts` -- `updateTag("notes")`

### 5.3 Remove Read-Only Server Actions

These are fully replaced by `useLiveQuery`:

- `src/actions/get-notes.ts` -- delete entire file
- `src/actions/get-note.ts` -- delete entire file
- `src/actions/search-notes.ts` -- delete entire file (search is now client-side)

### 5.4 Remove Write Server Actions

These are replaced by the mutations API route:

- `src/actions/create-note.ts` -- delete entire file
- `src/actions/update-note.ts` -- delete entire file
- `src/actions/delete-note.ts` -- delete entire file
- `src/actions/pin-note.ts` -- delete entire file
- `src/actions/unpin-note.ts` -- delete entire file

### 5.5 Clean Up Unused Imports

Run `pnpm knip` to detect and remove:

- Unused `updateTag` / `cacheTag` imports
- Unused `authorizedServerAction` usage (if no server actions remain that use it)
- Unused repository methods that were only used by removed actions

### Verify

```sh
pnpm typecheck
pnpm lint
pnpm knip    # No unused exports/files/deps
pnpm test
pnpm build
```

---

## Phase 6 -- Debounce Auto-Save (Enhancement)

**Goal:** Use TanStack DB's `usePacedMutations` for the note editor, debouncing saves instead of requiring explicit form submission.

### Implementation

```tsx
"use client";

import { usePacedMutations } from "@tanstack/react-db";
import { useState } from "react";

import { notesCollection } from "@/collections/notes";

export function NoteEditor({
  noteId,
  initialContent,
}: {
  initialContent: string;
  noteId: string;
}) {
  const [content, setContent] = useState(initialContent);
  const pace = usePacedMutations(notesCollection, {
    strategy: debounceStrategy({ delay: 1000 }),
  });

  const handleChange = (value: string) => {
    setContent(value);

    pace.update(noteId, (draft) => {
      draft.content = value;
      draft.updated_at = new Date().toISOString();
    });
  };

  return (
    <textarea onChange={(e) => handleChange(e.target.value)} value={content} />
  );
}
```

This debounces mutations by 1 second -- typing pauses trigger a save. No explicit "Save" button needed (though one can remain as a fallback). The mutation applies optimistically on every keystroke, but the server call is debounced.

---

## File Change Summary

### New Files

| File                                          | Purpose                                              |
| --------------------------------------------- | ---------------------------------------------------- |
| `src/app/api/notes-shape/route.ts`            | Authenticated Electric shape proxy                   |
| `src/app/api/notes/mutations/route.ts`        | Mutation API (insert/update/delete with txid)        |
| `src/collections/notes.ts`                    | TanStack DB notes collection definition              |
| `src/components/providers/notes-provider.tsx` | Collection provider for authenticated users          |
| `src/components/notes/notes-list-view.tsx`    | Client component replacing server-fetched notes list |

### Modified Files

| File                                          | Change                                                 |
| --------------------------------------------- | ------------------------------------------------------ |
| `src/env.ts`                                  | Add `ELECTRIC_URL`, `ELECTRIC_SOURCE_ID`               |
| `src/server/db/index.ts`                      | Switch from `neon-http` to `neon-serverless` (`Pool`)  |
| `src/app/notes/page.tsx`                      | Use `<NotesListView />` instead of server-fetched data |
| `src/app/page.tsx`                            | Use client component for recent notes + count          |
| `src/app/notes/[id]/page.tsx`                 | Use collection for note detail                         |
| `src/app/notes/[id]/edit/page.tsx`            | Use collection mutation for update                     |
| `src/app/notes/new/page.tsx`                  | Use collection mutation for create                     |
| `src/components/notes/note-actions.tsx`       | Use collection mutations for pin/unpin/delete          |
| `src/components/notes/delete-note-button.tsx` | Use `notesCollection.delete()`                         |
| `src/components/notes/pin-note-button.tsx`    | Use `notesCollection.update()` for pin toggle          |
| `src/components/notes/notes-filters.tsx`      | Drive filters locally via `useLiveQuery`               |
| `src/components/notes/notes.tsx`              | Accept `ClientNote[]` instead of `SelectNote[]`        |
| `src/components/notes/recent-notes.tsx`       | Convert to client component with `useLiveQuery`        |
| `src/components/notes/note-card.tsx`          | Accept `ClientNote` instead of `SelectNote`            |
| `package.json`                                | Add Electric/TanStack DB deps, `ws`, `bufferutil`      |

### Deleted Files

| File                          | Reason                          |
| ----------------------------- | ------------------------------- |
| `src/actions/get-notes.ts`    | Replaced by `useLiveQuery`      |
| `src/actions/get-note.ts`     | Replaced by `useLiveQuery`      |
| `src/actions/search-notes.ts` | Search is client-side now       |
| `src/actions/create-note.ts`  | Replaced by collection mutation |
| `src/actions/update-note.ts`  | Replaced by collection mutation |
| `src/actions/delete-note.ts`  | Replaced by collection mutation |
| `src/actions/pin-note.ts`     | Replaced by collection mutation |
| `src/actions/unpin-note.ts`   | Replaced by collection mutation |

### Preserved (unchanged)

| File                                         | Why                                                |
| -------------------------------------------- | -------------------------------------------------- |
| `src/lib/auth.ts`                            | Better Auth stays as-is                            |
| `src/lib/authorized.ts`                      | Still used by mutations API route                  |
| `src/proxy.ts`                               | Auth middleware unchanged                          |
| `src/server/services/note-service.ts`        | Service layer reused by mutations API              |
| `src/server/repositories/note-repository.ts` | Repository reused by service layer                 |
| `src/server/db/schemas/notes.ts`             | Drizzle schema unchanged                           |
| `src/server/schemas/note-schemas.ts`         | Zod schemas may still be used for validation       |
| `src/lib/id.ts`                              | TypeID generation unchanged (client-generated IDs) |

---

## Testing Strategy

### Unit Tests

- Mock `@tanstack/react-db` (`useLiveQuery`) to return controlled data.
- Mock `@/collections/notes` (`notesCollection.insert`, `.update`, `.delete`) to verify mutation calls.
- Existing test patterns (mock server actions) become mock collection mutations -- structurally similar.

### Integration Tests

- Verify the shape proxy returns 401 without auth.
- Verify the mutations API route returns `{ txid }`.
- Verify collection syncs with Electric (requires Electric Cloud to be running).

### Manual Testing Checklist

- [ ] Create a note -- appears instantly in the list.
- [ ] Edit a note -- changes appear without page reload.
- [ ] Delete a note -- disappears instantly.
- [ ] Pin/unpin -- toggles instantly.
- [ ] Search -- filters locally, sub-millisecond.
- [ ] Open two tabs -- changes sync between them.
- [ ] Disconnect network -- create/edit/delete still work locally.
- [ ] Reconnect -- pending mutations sync to server.
- [ ] Refresh page -- data reloads from Electric stream.

---

## Risks and Mitigations

| Risk                              | Mitigation                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Electric Cloud downtime           | App still works offline; writes queue locally. Reads show last-synced data.                                       |
| Neon logical replication lag      | For a personal notes app, sub-second lag is acceptable. No real-time collaboration needed.                        |
| TanStack DB is pre-1.0            | Pin exact versions. The API surface we use (`Collection`, `useLiveQuery`, `electricCollectionOptions`) is stable. |
| Snake_case vs camelCase confusion | Define `ClientNote` type once in `src/collections/notes.ts`. All components use this type.                        |
| Large note content in shapes      | Electric streams full rows. For a personal notes app, total data is small (hundreds of notes, not millions).      |
| Transaction overhead from txid    | Minimal -- `pg_current_xact_id()` is a cheap function call within an existing transaction.                        |
