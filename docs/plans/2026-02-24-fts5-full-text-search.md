# FTS5 Full-Text Search

Replace the `LIKE '%query%'` search with SQLite FTS5 for multi-word matching, relevance ranking, and better performance.

## Problem

The current search uses `LIKE '%query%'` on the `content` column which:

- Performs a full table scan every query (no index usage)
- No relevance ranking -- results come back in sort order, not match quality
- No word-boundary matching ("app" matches "happy", "application", "disappear")
- Single-term only -- no multi-word support
- Highlight applied to truncated content -- if the match is beyond the truncation point, the note appears in results but with no visible highlight

## Solution

Use SQLite FTS5 with an external content table backed by the existing `note` table. FTS5 is built into libSQL (zero new dependencies) and provides tokenized word matching, `bm25()` relevance ranking, prefix queries, and `snippet()` for context-aware excerpts.

## Technical Design

### FTS5 Virtual Table

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
  content,
  content=note,
  content_rowid=rowid,
  tokenize='unicode61'
);
```

The `note` table uses a `text` primary key (`id`), but SQLite still maintains an implicit integer `rowid` for regular tables. The FTS5 external content table references this implicit `rowid` via `content_rowid=rowid`.

The `unicode61` tokenizer handles accented characters well and is a good default for multilingual notes.

### Sync via SQLite Triggers

Three triggers on the `note` table keep the FTS index in sync automatically:

```sql
-- After INSERT
CREATE TRIGGER IF NOT EXISTS note_fts_insert AFTER INSERT ON note BEGIN
  INSERT INTO note_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- After UPDATE (delete old, insert new)
CREATE TRIGGER IF NOT EXISTS note_fts_update AFTER UPDATE ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO note_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- After DELETE
CREATE TRIGGER IF NOT EXISTS note_fts_delete AFTER DELETE ON note BEGIN
  INSERT INTO note_fts(note_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;
```

On first init, run `INSERT INTO note_fts(note_fts) VALUES('rebuild')` to populate the index from existing data. This is idempotent and safe to run multiple times.

### Setup Function

A new `ensureFts(db)` function in `src/server/db/fts.ts` runs the above SQL statements. It is called lazily from `getDb()` in `src/server/db/index.ts` on first database access. Since all statements are idempotent (`IF NOT EXISTS` for the table, `IF NOT EXISTS` for triggers), this is safe to call on every startup.

### Repository Changes

In `DBNoteRepository.findMany()`, when `filters.query` is present:

**Matching:** Replace `like(note.content, '%query%')` with an FTS5 `MATCH` query:

```sql
note.rowid IN (SELECT rowid FROM note_fts WHERE note_fts MATCH ?)
```

For multi-word queries, format as FTS5 terms with implicit AND: `"word1" "word2"`. Escape double-quotes in the input.

**Ranking:** When a query is active, use `bm25()` as the secondary sort (after pinned-first) instead of the time-based sort.

**Snippets:** Return a context-aware excerpt via FTS5's `snippet()` function:

```sql
SELECT note.*, snippet(note_fts, 0, '<mark>', '</mark>', '...', 30) as snippet
FROM note
JOIN note_fts ON note.rowid = note_fts.rowid
WHERE note_fts MATCH ?
```

Introduce a `NoteWithSnippet` type: `SelectNote & { snippet?: string }` and update the return type of `findMany`.

### Service + Action Layer

Minimal changes -- pass `NoteWithSnippet` through instead of `SelectNote`. The service stays thin.

### UI Changes

**`note-card.tsx` / `note-list-item.tsx`:** When a `snippet` prop is present, use it as the note preview instead of truncating `content`.

**`highlight.ts`:** Update `getHighlightedParts` to support multi-word highlighting -- split the query by whitespace, build a regex alternation `(word1|word2|word3)`, highlight all terms.

## Files to Create

| File                   | Purpose                           |
| ---------------------- | --------------------------------- |
| `src/server/db/fts.ts` | FTS5 setup function (`ensureFts`) |

## Files to Modify

| File                                         | Change                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/server/db/index.ts`                     | Call `ensureFts(db)` in `getDb()`                                                                     |
| `src/server/repositories/note-repository.ts` | Replace `like()` with FTS5 `MATCH`, add `bm25()` ranking, add `snippet()` support, update return type |
| `src/server/services/note-service.ts`        | Pass through `NoteWithSnippet` type                                                                   |
| `src/actions/get-notes.ts`                   | Pass through snippet data                                                                             |
| `src/app/notes/page.tsx`                     | Pass snippet data to `NotesList`                                                                      |
| `src/components/notes/notes.tsx`             | Accept and pass snippet data per note                                                                 |
| `src/components/notes/note-card.tsx`         | Use snippet for display text when available                                                           |
| `src/components/notes/note-list-item.tsx`    | Use snippet for display text when available                                                           |
| `src/lib/utils/highlight.ts`                 | Support multi-word highlighting                                                                       |

## Edge Cases

| Case                                | Handling                                                          |
| ----------------------------------- | ----------------------------------------------------------------- |
| Empty query                         | Skip FTS, use existing code path (no `MATCH`)                     |
| Special characters (`"`, `*`, etc.) | Escape before passing to FTS5 `MATCH`                             |
| Query with only whitespace          | Treat as empty                                                    |
| No FTS matches                      | Return empty array                                                |
| Notes created before FTS setup      | `rebuild` command on first init populates the index               |
| `db:push` drops/recreates tables    | `ensureFts()` recreates the FTS table and triggers on next access |

## What Stays the Same

- Search UI (search bar, form submit, nav search)
- URL params (`q`, `sort`, `time`)
- Filter bar (sort, time range)
- Cache strategy (`"use cache"` + `cacheTag("notes")`)
- `db:push` workflow -- FTS is managed by `ensureFts()`, orthogonal to Drizzle

## Alternatives Considered

### Improved `LIKE` queries

Split multi-word queries into AND'd `LIKE` clauses. Minimal changes but no ranking, no word boundaries, no performance gain. Still full table scans.

### Client-side search (Fuse.js)

Fuzzy matching + live search, but requires loading all note content to the browser. Fights the server-rendered architecture (RSC + `"use cache"`). Search state would diverge from server state.

### External search service (MeiliSearch, Typesense)

Massive overkill for a single-user personal notes app. Adds deployment/ops overhead and sync complexity.

## Tests

- `highlight.spec.ts` -- add multi-word highlighting tests
- `note-card.spec.tsx` / `note-list-item.spec.tsx` -- update to test snippet display
- Manual verification for `ensureFts` (no DB integration test infrastructure currently)
