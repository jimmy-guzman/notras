# Atomic Note + Tag Writes

Make `NoteService.create` and `NoteService.update` atomic: if tag sync fails after the note has been written, the note write is rolled back so partial state (note without tags) can never persist.

## Problem

`NoteService.create` and `NoteService.update` currently perform two independent `await` calls:

```ts
await this.noteRepo.create({ content, id, userId }); // step 1 — persists immediately
await getTagService().syncTags(userId, id, tags); // step 2 — runs in a separate statement
```

If step 2 throws (e.g. a DB error mid-sync), step 1 has already committed. The note exists in the database without any tags — partial state that is invisible to the user and hard to recover from.

The same problem exists in `update`:

```ts
await this.noteRepo.update(noteId, userId, { content });
await getTagService().syncTags(userId, noteId, tags);
```

## Approach: DB Transaction

Drizzle's `db.transaction(tx => ...)` runs all statements inside `tx` in a single SQLite transaction. We thread `tx` (a Drizzle `Database`-compatible client) through the repository layer so all note and tag writes share the same transaction context.

### Why not compensating rollback?

A compensating rollback (catch + delete the note on tag failure) leaves a brief window where the incomplete note is visible, and adds complex error-handling logic. A real transaction is cleaner and the correct tool — Drizzle supports it natively.

### Why not a large architectural refactor?

We do not need to redesign the entire service/repository layer. The change is scoped: add one optional `tx` parameter that all call-sites can ignore, and one `withTransaction` method on `NoteRepository` that wraps the Drizzle transaction API.

## Technical Design

### 1. `Database` type alias

`src/server/db/index.ts` exports `Database` as `ReturnType<typeof createClient>`. Drizzle's transaction callback receives a `tx` argument typed as `DrizzleD1Database` (or the libSQL equivalent) — the same interface as `db`. No new type is needed; the transaction client satisfies the existing `Database` type.

Verify: check what `getDb()` returns and confirm `typeof tx` inside `db.transaction()` is assignable to `Database`.

### 2. `NoteRepository.withTransaction<T>`

Add one method to the `NoteRepository` interface:

```ts
withTransaction<T>(fn: (tx: NoteRepository) => Promise<T>): Promise<T>;
```

`DBNoteRepository.withTransaction` delegates to `this.db.transaction(async (tx) => fn(new DBNoteRepository(tx)))`. The inner `fn` receives a fresh `DBNoteRepository` scoped to the transaction client — no changes needed to any other repository methods.

### 3. `TagRepository` / `DBTagRepository`

Add the same `withTransaction` pattern **or** accept an optional `tx` argument on `syncTagsForNote`:

```ts
syncTagsForNote(
  noteId: NoteId,
  userId: string,
  tagNames: string[],
  tx?: Database,
): Promise<void>;
```

When `tx` is provided, `DBTagRepository` uses it instead of `this.db` for all statements in that call. This is simpler than a full `withTransaction` on `TagRepository` because only `syncTagsForNote` (and its callee `deleteOrphanedTags`) need to share the transaction.

Similarly thread `tx` into `deleteOrphanedTags` (called from `syncTagsForNote`).

### 4. `TagService.syncTags`

Add optional `tx` parameter:

```ts
syncTags(userId: string, noteId: NoteId, tagNames: string[], tx?: Database): Promise<void>;
```

Pass it through to `this.tagRepo.syncTagsForNote`.

### 5. `NoteService.create` and `NoteService.update`

Wrap note write + tag sync in `this.noteRepo.withTransaction`:

```ts
async create(userId: string, content: string, tags?: string[]): Promise<NoteId> {
  const id = this.idGenerator();
  const formatted = await formatMarkdown(content);

  await this.noteRepo.withTransaction(async (txRepo) => {
    await txRepo.create({ content: formatted, id, userId });

    if (tags !== undefined) {
      await getTagService().syncTags(userId, id, tags, /* tx */);
    }
  });

  void getLinkService().syncLinks(userId, id, formatted);

  return id;
}
```

`getLinkService().syncLinks` fires after the transaction commits (it is intentionally fire-and-forget and operates on a separate table, so it does not need to be atomic with the note).

The challenge is threading `tx` from `txRepo` into `getTagService().syncTags`. Options:

- **Option A (preferred):** Expose `db` on `DBNoteRepository` (or add a `getDb()` method) so the transaction callback can extract the `tx` client and pass it to `syncTags`. This keeps `NoteService` from depending directly on `Database`.
- **Option B:** Accept a `Database` parameter on `NoteService.create`/`update` (breaks the interface — worse).
- **Option C:** Move tag sync inside `DBNoteRepository.withTransaction` (couples repositories — worse).

**Option A** is recommended: add a package-private `db` property accessor on `DBNoteRepository`, use it only inside `NoteService` which already imports the concrete class for instantiation.

### 6. `update` path

Same pattern — wrap `noteRepo.update` + `getTagService().syncTags` in `this.noteRepo.withTransaction`.

## File Checklist

| File                                         | Change                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/server/repositories/note-repository.ts` | Add `withTransaction<T>` to `NoteRepository` interface; implement on `DBNoteRepository`                         |
| `src/server/repositories/tag-repository.ts`  | Add optional `tx?: Database` to `syncTagsForNote` and `deleteOrphanedTags` on `DBTagRepository`; thread through |
| `src/server/services/tag-service.ts`         | Add optional `tx?: Database` to `TagService.syncTags` and `TagServiceImpl.syncTags`; pass to repo               |
| `src/server/services/note-service.ts`        | Wrap `create` and `update` in `withTransaction`; pass `tx` to `syncTags`                                        |

## Open Questions

1. Does `tx` inside `this.db.transaction()` satisfy the `Database` type exported from `src/server/db/index.ts`? Verify before writing code — if the types diverge, a small adapter may be needed.
2. `import-service.ts` also calls `tagRepo.syncTagsForNote` directly inside a loop. This is a separate concern (each note in the import is already an independent upsert) — it is **out of scope** for this plan.

## Verification

After implementing:

```
pnpm knip
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Consider adding a unit test that stubs `tagRepo.syncTagsForNote` to throw and asserts that `noteRepo.create` was not committed (i.e. a subsequent `findById` returns `undefined`).
