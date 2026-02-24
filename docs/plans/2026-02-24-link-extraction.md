# Link Extraction from Notes

Extract URLs from note content on save, fetch Open Graph metadata, store as first-class `link` entities in the DB, and display as a minimal list below note content on the detail page.

## Problem

Notes often contain URLs -- references, bookmarks, articles to read later. Currently, URLs in note content are plain text: not clickable, not enriched with metadata, and not queryable across notes. There's no way to see "all links I've saved" or find which notes reference a particular URL.

## Solution

When a note is created or updated, extract all URLs from the content, fetch Open Graph metadata (title, description) for each, and store them in a `link` table. Display extracted links as a minimal list (title + URL) below the note content on the detail page. The schema is future-proofed for cross-note features (all-links page, shared link detection, link search/filter) without building those yet.

## Technical Design

### Schema

New table: `link`

| Column        | Type                 | Notes                                                  |
| ------------- | -------------------- | ------------------------------------------------------ |
| `id`          | text (PK)            | TypeID: `link_<26-char>`                               |
| `noteId`      | text (FK -> note.id) | Cascade delete. Which note this link belongs to        |
| `userId`      | text (FK -> user.id) | Cascade delete. Owner (future-proofing for multi-user) |
| `url`         | text, NOT NULL       | The raw URL extracted from content                     |
| `title`       | text                 | OG title (nullable -- fetch may fail)                  |
| `description` | text                 | OG description (nullable)                              |
| `createdAt`   | integer (timestamp)  | When the link was first extracted                      |

A composite unique constraint on `(noteId, url)` prevents duplicate links per note while allowing the same URL across different notes (enabling future "shared links" queries).

### URL Extraction

Regex matches both bare `https?://` URLs and Markdown `[text](url)` syntax in the note content. The content is plain text with possible Markdown formatting (normalized by oxfmt before storage).

### Open Graph Fetching

A dedicated OG service fetches metadata for each extracted URL:

- Uses native `fetch()` to GET the URL
- Parses `<meta property="og:title">` and `<meta property="og:description">` tags from the `<head>` section via regex
- Timeout + error handling (graceful failure -- a link with no metadata is still stored)
- No external dependencies (no cheerio, jsdom, etc.)

### Sync Strategy

On create/update, the link service:

1. Extracts all URLs from the formatted content
2. Looks up existing links for the note to carry forward metadata for known URLs
3. Deletes all existing links for the note
4. Fetches OG metadata for newly seen URLs only (skip known URLs with existing metadata)
5. Inserts the current link set

This delete + re-insert approach is simpler than diffing. Since there's no per-link user state (clicks, bookmarks) to preserve, it's safe.

### Non-Blocking Fetch

OG metadata fetching does **not** block the note save. The create/update actions already redirect after saving, so `syncLinks()` is fired off without awaiting. Links appear on the next page load after the initial redirect.

### Display

A minimal list below the note content on the detail page. Each item shows:

- The title (as a clickable `<a>` linking to the URL) if OG metadata was fetched
- Falls back to the raw URL if no title is available
- `ExternalLinkIcon` from lucide next to each link
- Only rendered when links exist (no empty state)

### Cache Strategy

The `getLinks` server action uses `"use cache"` with `cacheTag("notes")`, piggybacking on existing cache invalidation from note mutations. No new cache tags needed.

## Files to Create

| File                                         | Purpose                                         |
| -------------------------------------------- | ----------------------------------------------- |
| `src/server/db/schemas/links.ts`             | Drizzle schema for `link` table                 |
| `src/server/repositories/link-repository.ts` | `LinkRepository` interface + `DBLinkRepository` |
| `src/server/services/og-service.ts`          | Open Graph metadata fetcher                     |
| `src/server/services/link-service.ts`        | URL extraction, sync logic, singleton getter    |
| `src/actions/get-links.ts`                   | Cached server action to fetch links for a note  |
| `src/components/notes/note-links.tsx`        | UI component: minimal link list                 |

## Files to Modify

| File                                    | Change                                                            |
| --------------------------------------- | ----------------------------------------------------------------- |
| `src/server/db/index.ts`                | Spread `links` schema into the schema object                      |
| `src/server/services/note-service.ts`   | Call `linkService.syncLinks()` after create/update (non-blocking) |
| `src/server/services/import-service.ts` | Call `linkService.syncLinks()` after upsert                       |
| `src/app/notes/[id]/page.tsx`           | Fetch links via `getLinks()`, render `<NoteLinks>` below content  |

## Tests to Create

| File                                       | Coverage                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `src/server/services/og-service.spec.ts`   | OG metadata parsing, timeout handling, error cases                       |
| `src/server/services/link-service.spec.ts` | URL extraction regex (bare URLs, Markdown links, edge cases), sync logic |
| `src/components/notes/note-links.spec.tsx` | Renders links with titles, falls back to URLs, hides when empty          |

## Edge Cases

| Case                                       | Handling                                                        |
| ------------------------------------------ | --------------------------------------------------------------- |
| URL with no OG metadata                    | Store the link with null title/description, display raw URL     |
| OG fetch timeout/error                     | Graceful failure, store link without metadata                   |
| Duplicate URLs in same note                | Deduplicate during extraction (unique constraint enforces this) |
| Same URL across multiple notes             | Allowed -- enables future "shared links" queries                |
| Note deleted                               | Cascade delete removes associated links automatically           |
| Imported notes                             | Link extraction runs after upsert in import service             |
| Malformed URLs                             | Skip during extraction (regex won't match non-URLs)             |
| Very long notes with many URLs             | No limit on extracted links per note                            |
| Markdown `[text](url)` syntax              | URL extracted from the parentheses portion                      |
| URL appears both bare and in Markdown link | Deduplicated to a single link entry                             |

## Future Extensions

These are enabled by the schema but not built yet:

- **All links page** -- dedicated page listing all extracted links across all notes with metadata
- **Link count on note cards** -- show the number of links in each note on the home/list views
- **Shared links detection** -- identify when the same URL appears in multiple notes
- **Link search/filter** -- search or filter notes by the links they contain
- **Rich preview cards** -- upgrade from minimal list to cards with OG images
- **Linkification on display** -- make URLs clickable inline within note content (orthogonal to extraction)

## Alternatives Considered

### Client-side extraction only

Extract and display links at render time without DB storage. Simpler, but no cross-note queries, no cached metadata, and repeated OG fetches on every page load.

### Full Markdown rendering

Render all Markdown syntax (headings, bold, lists, links) instead of just extracting links. Much larger scope. Link extraction is orthogonal and can coexist with future Markdown rendering.

### External link preview service

Use a third-party API (e.g., microlink.io, linkpreview.net) for metadata. Adds an external dependency and potential rate limits for a single-user app. Native `fetch()` + HTML parsing is sufficient.

### Store links in a JSON column on the note table

Avoids a new table but prevents cross-note queries, makes schema rigid, and fights the relational model.
