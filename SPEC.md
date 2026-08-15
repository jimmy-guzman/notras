# SPEC: notras → local-first Tauri desktop app

> Working document for the rewrite. Update checkboxes and the progress log as work lands.

## Context

notras is a single-user, local-first notes app currently wrapped in Next.js 16 and shipped
as a Docker image. The web-app framing has failed. The replacement is a desktop app that
takes "just write, otra vez" seriously — and makes AI a first-class co-writer of notes.

The pivotal decision (inspired by [erictli/scratch](https://github.com/erictli/scratch)):
**notes are plain `.md` files you own**, not database rows. That one choice is what makes
the AI story free — Claude Code or any agent just writes markdown into the notes folder,
a file watcher picks it up, the app refreshes. The filesystem is the API. No MCP server,
no endpoints, nothing to build or run.

SQLite doesn't go away — it's demoted. The same FTS5 machinery that powers search today
becomes a **derived, disposable index** owned entirely by Rust, rebuilt from the files at
any time.

## Decisions (locked)

| Decision      | Choice                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Shell         | Tauri v2 + Vite + React 19 SPA, TanStack Router                                                                                 |
| Storage       | **Files-first**: `.md` + YAML frontmatter; directories = folders; SQLite FTS5 as derived index (`.notras/index.db`), Rust-owned |
| Editor        | TipTap 3 WYSIWYG over `@tiptap/markdown` (bidirectional GFM); ⌘P raw source mode                                                |
| Editing model | Edit-in-place, autosave on ~800ms idle; format-on-blur/note-switch (remark), never while typing                                 |
| Layout        | **Editor-first**: the window is the editor; ⌘K floating palette for search/switch/filter; no persistent sidebar                 |
| Launch        | Last-edited note, editor focused; wordmark + tagline as empty state                                                             |
| Settings      | Dialog (⌘,) — notes folder picker, syntax highlighting toggle                                                                   |
| Effect-TS     | Keep as-is: services, Context.Tag/Layer, ManagedRuntime, typed errors                                                           |
| AI notes      | **Solved by architecture** — agents write `.md` files; watcher → index → UI                                                     |

## Feature set (final)

**Keep / build:**

- markdown notes as files; filename is the title (inline title field renames the file)
- CodeMirror 6 editor: **live preview**, Obsidian-style -- syntax marks
  (`##`, `**`, backticks, link brackets/URLs, `> `) hidden on elements the
  cursor isn't touching; bullets render as •, task checkboxes are clickable
  (writing `[x]` back to the file), fence lines vanish into a code card,
  `---` draws a rule, images render inline via the asset protocol, tables
  render (plain-text cells) and drop to source on touch
- autosave + format-on-blur (remark pipeline)
- ⌘P rendered preview (react-markdown + remark-gfm + rehype-expressive-code survive here)
- FTS5 search (bm25, snippets) via the ⌘K palette
- tags (frontmatter `tags:`), pins (frontmatter `pinned:`), folders (real directories)
- **wikilinks** `[[note title]]` with autocomplete (replaces the old links sidebar with
  links between _your_ notes); rendered + clickable in preview, cmd-click in editor
- **slash commands** — `/` quick-insert menu (heading, task list, code block, date)
- **open external `.md`** — drag-and-drop or "Open With" any markdown file
- code-block chrome (copy, language picker); link editing (⌘⇧K) and
  ⌘-click to open in the browser
- drag a file/image into the editor → copied to `attachments/`, markdown link inserted;
  images render in preview via the Tauri asset protocol
- iA-Writer-style writing niceties: **focus mode** (dim all but active paragraph),
  **typewriter scrolling** (active line stays centered), word count + reading time in
  the status strip, iA Writer Quattro as the editor face (SIL OFL, bundled)
- global **quick-capture**: system-wide hotkey → small always-on-top window → jot → esc
- menu-bar tray icon (open / new note / quick capture), launch-at-login toggle
- macOS overlay title bar (hidden title, traffic lights over content)
- keyboard shortcuts everywhere; lowercase aesthetic; dark/light via system

**Cut** (each removes real machinery):

- ~~link extraction + OG previews~~ → og/link services, `links` table, only network dep
- ~~reminders~~ → SSE route, 30s polling fiber, notification plugin, reminder presets
- ~~export/import zip~~ → the folder IS the export; fflate, export/import services
- ~~image optimization~~ → sharp/Rust image pipeline; attachments are copied as-is
- ~~profile/greeting~~ → user table, user-service, device-user seeding, profile form
- ~~asset BLOBs~~ → blob IPC, `/api/assets`, uploader/preview components
- ~~cache invalidation machinery~~ → `CacheInvalidator` port, `forkBackground` (no
  remaining consumers); mutations await, then `router.invalidate()`

## Architecture

```
┌───────────────────── Tauri window (webview) ─────────────────────┐
│  React SPA — routes: /  /notes/$path                             │
│  CodeMirror editor · ⌘K palette · ⌘P preview · settings dialog   │
│                                                                  │
│  src/data/*  →  Effect services  →  two ports:                   │
│    FileStore  ──plugin-fs──►  ~/notras/**/*.md   (writes)        │
│    Index      ──db_select──►  .notras/index.db   (reads only)    │
└──────────────────────────────┬───────────────────────────────────┘
                               │ after write: index_paths([...])
┌──────────────────────────────▼───────────────────────────────────┐
│  Rust (src-tauri) — SINGLE WRITER of the index                   │
│  · notify watcher on notes dir (debounced)                       │
│  · frontmatter parse (serde_yaml) + scan/reconcile by mtime      │
│  · rusqlite (bundled, FTS5): note / note_tag / note_fts          │
│  · emits "notes-changed" event → webview refreshes               │
└───────────────────────────────────────────────────────────────────┘
        ▲
        │  any editor, git, or AI agent writes .md files
   ~/notras/  ← source of truth, 100% plain markdown
```

Key properties:

- **Rust owns all index writes.** TS never executes SQL writes — Drizzle (`sqlite-proxy`)
  issues read-only SELECTs through a `db_select` command. The transaction-serialization
  problem from the SQLite-first design **does not exist** here.
- **Index is disposable.** `ensure_index_schema` (CREATE IF NOT EXISTS + FTS5) runs on
  startup; deleting `.notras/index.db` just triggers a rebuild. No drizzle-kit, no
  migrations, no `db:push`.
- **Write path:** service → FileStore writes the `.md` → `await index_paths([path])` →
  `router.invalidate()`. The watcher also reindexes (idempotent) — it exists for
  _external_ writers; self-writes are reconciled by mtime/hash so events don't echo.
- **External edit while note is open:** if the buffer is clean, reload from disk; if
  dirty, the user's next autosave wins (single-user; last-write-wins is fine).
- **Note identity = relative path.** Renames are delete+create in the index; wikilinks
  resolve by filename/title, so a rename can dangle links (accepted; scratch does same).
- Frontmatter is parsed in both Rust (indexing, serde_yaml) and TS (editing pins/tags —
  small module in `src/core/frontmatter.ts` with tests). Keep the two in parity; the
  format is deliberately tiny: `pinned: bool`, `tags: string[]`, nothing else.

### Index schema (Rust-created, mirrored as Drizzle defs for typed SELECTs)

```sql
note(path TEXT PK, title TEXT, folder TEXT, pinned INT, created_at INT, updated_at INT)
note_tag(path TEXT, tag TEXT, PRIMARY KEY(path, tag))
note_fts(title, content)  -- fts5, unicode61; bm25 + snippet() as today
```

`src/server/db/fts-query.ts` (`buildFtsMatchQuery`, `getSnippetExpression`,
`getSearchOrderBy`) survives nearly verbatim — same normalization, ranking, markers.

### What survives from the current codebase

| Survives                                                                                | Dies                                                      |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `src/core/**` minus reminder-presets, cache-invalidator, background (knip will confirm) | `src/app/**`, `src/actions/**` (rewritten as `src/data/`) |
| `fts-query.ts`, FTS semantics, `[[hl]]` snippet markers + `fts-snippet.ts` renderer     | link/og/asset/export/import/user services + repos         |
| Effect service pattern, `makeAppLayer`, `ManagedRuntime`                                | `CacheInvalidator` + `Fetcher` need, `forkBackground`     |
| `format-service` (reimplemented on remark — oxfmt is napi, can't run in webview)        | drizzle-kit, `@libsql/client`, sharp, fflate usage        |
| note/folder/tag services (rewired to FileStore + Index)                                 | user table, device-user, safe-action, nuqs                |
| preview stack: react-markdown, remark-gfm, rehype-expressive-code                       | next-safe-action, next-themes, @t3-oss/env-nextjs, zod    |
| shadcn/ui components, lowercase aesthetic, stone palette, hotkeys                       | SSE reminders, NoteDropPanel, SiteNav, home hero page     |

---

## Phase 0 — Scaffold

- [x] `src-tauri/` (tauri 2.11.x); plugins: `dialog`, `opener`, `store`,
      `global-shortcut`, `autostart` (no `http`, `notification`, `sql`, or even `fs` --
      all note IO goes through Rust commands so the dynamic notes-dir scope is
      enforced at runtime)
- [x] Cargo: `rusqlite` (bundled — FTS5 is compiled in unconditionally), `notify`,
      `serde`, `serde_json`, `serde_yaml`
- [x] `vite.config.ts`: react, `@tailwindcss/vite`, `@tanstack/router-plugin`, alias `@`,
      port 1420 strictPort
- [x] `tauri.conf.json`: hidden title bar + overlay traffic lights, `.md` file
      association, tray icon, second window config for quick-capture
- [x] Scripts: `dev` → `tauri dev`, `build` → `tauri build`, `dev:web`, `build:web`

## Phase 1 — Rust core (files + index)

- [x] `notes_dir` resolution: from store config, default `~/notras` (created on first run)
- [x] `ensure_index_schema` on startup at `<notes_dir>/.notras/index.db`
- [x] Indexer: scan + mtime reconcile on startup; write commands index
      synchronously (no separate index step); frontmatter parse; FTS upsert;
      delete handling
- [x] `notify` watcher (debounced ~300ms, ignores `.notras/`) → reindex → emit
      `notes-changed { paths }` to webview
- [x] `db_select(sql, params)` command (rejects anything that isn't
      SELECT/WITH -- Rust is the only writer)
- [x] Commands: `rename_note(from, to)`, `set_notes_dir(path)` (re-scan + re-watch)

## Phase 2 — TS data layer

- [x] `src/core/frontmatter.ts`: parse/serialize `{ pinned, tags }` + body (tests; parity
      with Rust)
- [x] `FileStore` port (Context.Tag in core) + `src/server/adapters/tauri-file-store.ts`
      (Rust commands, scoped to notes dir)
- [x] `Index` access: Drizzle `sqlite-proxy` over `db_select` in
      `src/server/adapters/tauri-database.ts`; new lean schema defs
- [x] Rewrite `note-repository`: reads = SELECTs against index (list/search/filters port
      over); writes = FileStore + `index_paths`
- [x] folder/tag repositories folded into `note-repository` reads (folders
      emerge from paths; tags from frontmatter)
- [x] Preferences via plugin-store (`syntaxHighlighting`, `notesDir`, `launchAtLogin`)
- [x] `runtime.ts`: `ManagedRuntime.make(makeAppLayer({ fileStore, database }))`
- [x] `src/actions/` → `src/data/`: plain async fns; validation stays Effect Schema;
      mutations end with `router.invalidate()`

## Phase 3 — Editor

- [x] CodeMirror 6: `@codemirror/lang-markdown` + lezer highlighting; live-styled source
      (big headings, bold/italic, highlighted code blocks); theme on the stone/oklch
      tokens, dark via system
- [x] Autosave: 800ms idle debounce → save file → index; status strip shows saved state
- [x] Format-on-blur/note-switch: remark-parse → remark-gfm → remark-stringify (return
      original on any error, as today); update `format-service.spec.ts`, drop
      `vi.mock("oxfmt")`; `oxfmt` → devDependency (kept for `pnpm format` only)
- [x] Focus mode (⌘D): dim non-active paragraphs via CM6 decorations; typewriter
      scrolling toggle (scroll active line to vertical center)
- [x] Status strip: saved state · word count · reading time
- [x] Bundle iA Writer Quattro (+ Mono for code spans) as the editor font
- [x] Wikilink autocomplete: `[[` triggers completion sourced from index titles
- [x] Slash commands: `/` at line start → completion menu (headings, task list, code
      block, date)
- [x] ⌘P preview: existing MarkdownContent stack + hand-rolled `[[...]]` link
      transform (clickable) + image URLs rewritten through the asset protocol
- [x] Inline title field above editor → `rename_note`
- [x] Drag file/image in → copy to `attachments/`, insert markdown link

## Phase 4 — Shell & UI

- [x] Routes: `__root.tsx`, `index.tsx` (redirect to last note or empty state),
      `notes.$path.tsx` (splat for nested dirs)
- [x] ⌘K palette (shadcn Command/cmdk): FTS search with highlighted snippets, filter
      tokens (tag/folder/pinned), recent notes, "create note", "settings"
- [x] Empty state: wordmark + "just write, otra vez." + ⌘n / ⌘k hints
- [x] Settings dialog (⌘,): notes folder picker (plugin-dialog), syntax highlighting,
      launch at login
- [x] `notes-changed` listener → reload clean buffer / refresh palette + lists
- [x] Hotkeys: ⌘n new, ⌘k palette, ⌘p preview, ⌘d focus, ⌘, settings
      (shift+/ shortcuts help: still todo)
- [x] Delete/pin/tag via palette actions + editor toolbar strip
- [x] Port lowercase aesthetic, globals.css tokens, Toaster; delete SiteNav, home hero,
      NoteDropPanel, dnd-kit (drag-to-folder replaced by palette "move to folder")

## Phase 5 — Desktop niceties

- [x] Quick capture: global shortcut → small always-on-top window, bare editor →
      `inbox/<timestamp>.md`, esc saves & hides
- [x] Tray: open, new note, quick capture, quit; close-to-tray behavior
- [x] Autostart plugin wired to settings toggle
- [x] "Open With" / drag-onto-window for external `.md` (outside notes dir: editable,
      not indexed)

## Phase 6 — Teardown

- [x] Delete: `src/app/**`, old actions, safe-action, nuqs params, env.ts, next/postcss
      configs, Dockerfile, PWA/icons, SSE route, all cut services/repos/components,
      `drizzle.config.ts`, e2e/ (Playwright can't drive Tauri; wdio+tauri-driver is a
      follow-up), nextjs-agent-rules block
- [x] Drop deps: next, next-safe-action, next-themes, @t3-oss/env-nextjs, zod, nuqs,
      sharp, fflate, @libsql/client, drizzle-kit, @dnd-kit/*, react-hook-form,
      @hookform/resolvers, @playwright/test (use-debounce stays -- palette +
      external-file autosave)
- [x] Add: @tauri-apps/api + 6 plugins, @tanstack/react-router, codemirror packages,
      remark-parse/stringify, cmdk (via shadcn); dev: @tauri-apps/cli,
      @tanstack/router-plugin, @tailwindcss/vite
- [x] Move `oxfmt` → devDependencies

## Phase 7 — Tooling & docs

- [x] ESLint boundary blocks (keep last, keep narrow): core bans `@tauri-apps/*` +
      node/react; server layer bans `@tauri-apps/*` except
      `src/server/adapters/**` + `runtime.ts`; plus `@tanstack/eslint-plugin-router`
      (`create-route-property-order`), perfectionist `unsorted` for Route objects,
      react-refresh `extraHOCs` for route creators
- [x] Vitest: frontmatter + format + fts-snippet tests (component tests removed
      with their components; a RouterProvider test wrapper returns when they do)
- [x] Rust unit tests: frontmatter parse, indexer reconcile
- [x] Rewrite README + AGENTS.md (stack, structure, patterns, commands, verification)

---

## Risks

| Risk                                                      | Mitigation                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| CM6 live-styling is the biggest new UI effort             | Start with lang-markdown defaults + theme; inline decoration polish can iterate post-merge                   |
| Frontmatter drift between Rust and TS parsers             | Format is 2 fields; shared fixture file exercised by both test suites                                        |
| Watcher echo on self-writes                               | mtime/hash reconcile makes reindex idempotent; UI updates come from the awaited `index_paths`, not the event |
| Filename-as-title collisions & renames dangling wikilinks | Dedupe on create (`untitled-2.md`); accepted for links (scratch parity)                                      |
| remark-stringify output differs from oxfmt                | Deliberate; format only on blur so the caret never jumps                                                     |
| External `.md` with exotic frontmatter                    | Preserve unknown frontmatter keys verbatim on rewrite (parse → merge → serialize)                            |

## Verification

```
pnpm knip && pnpm typecheck && pnpm lint && pnpm test && pnpm build   # static gate
cargo test  # in src-tauri
```

Manual walkthrough (`pnpm tauri dev`):

- [ ] 1. First launch creates `~/notras/` + `.notras/index.db`; empty state shows
- [ ] 2. ⌘N → type → autosave badge; the `.md` file exists on disk with the content
- [ ] 3. Retitle the note → file renames on disk
- [ ] 4. **The money shot:** `echo "# from claude" > ~/notras/agent-note.md` from a
      terminal (or have Claude Code write one) → note appears in the palette within ~1s
- [ ] 5. ⌘K search a word → FTS hit with highlighted snippet
- [ ] 6. Add `tags: [x]` + `pinned: true` via UI → frontmatter in the file updates;
      filter by tag in palette
- [ ] 7. `[[` autocompletes another note; link navigates in ⌘P preview
- [ ] 8. `/` shows the slash menu; inserts a task list
- [ ] 9. Drag an image in → lands in `attachments/`, renders in preview
- [ ] 10. Edit a note in another editor while it's open (clean) → buffer reloads
- [ ] 11. Quick-capture hotkey from another app → jot → esc → file in `inbox/`
- [ ] 12. Delete `.notras/index.db`, relaunch → search still works (index rebuilt)
- [ ] 13. `pnpm tauri build` → built artifact launches; "Open With" on a random `.md` works

## Deferred

- iA parts-of-speech syntax highlighting + style check (needs real NLP — wrong weight)
- Content-block transclusion (`/file.md` embeds)
- Backlinks panel (wikilinks are one-directional this pass)
- Git integration UI (the folder is git-init-able by hand today)
- wdio + tauri-driver e2e (replaces the deleted Playwright smoke tests)
- Auto-update / code signing
- MCP server (only if agents ever need richer ops than file writes — search-as-a-tool)

## Progress log

| Date       | What landed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-15 | Editor polish: code blocks get hover chrome (copy button + language picker via React nodeview); links become functional (⌘⇧K add/edit/remove popover with url normalization, ⌘-click opens in browser via plugin-opener)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-15 | Source mode fidelity saga: highlighted source mode (single lowlight code block) with anchored toggles; block-offset heuristics replaced by exact sentinel round-trip through the markdown converters (caret spot survives toggles deterministically; corruption guard for syntax-interior carets); suggestion menus viewport-clamped                                                                                                                                                                                                                                                                                                      |
| 2026-08-15 | Studied erictli/scratch's shipped editor and adopted its polish: task-list CSS recipe (flex rows, zero p margins, hand-drawn checkboxes -- fixes broken task rendering), nbsp scrub on every serialize, markdown-sniffing paste, copy-as-markdown, [text](url) input rule, clipboard image paste via new attach_image Rust command (improved over scratch: relative attachments/ src stays in the file), tables not-prose, autocorrect/autocapitalize off (lowercase aesthetic + kills the blue underline), wikilinks restyled to dashed underline. Skipped: KaTeX/mermaid, code-block nodeview, frontmatter-as-node (ours is race-proof) |
| 2026-08-15 | Editor pivot: CM6 live preview replaced by TipTap 3 WYSIWYG (official @tiptap/markdown made round-tripping viable); wikilink pills with custom tokenizer, slash menu + wikilink suggestions, editable tables, clickable tasks, inline images, lowlight code; body-only editing with frontmatter composed from latest loader state; ⌘P becomes raw source mode; format-on-blur + remark stack + react-markdown preview + syntaxHighlighting pref removed; 14-case markdown round-trip spec is the new data-safety contract                                                                                                                 |
| 2026-08-15 | Live preview phase 2: blocks + widgets (bullets, clickable checkboxes, code cards with hidden fences, hr, inline images, rendered tables); ViewPlugin → StateField for block decorations; fixed markdown base to GFM (`markdownLanguage`) -- tables/tasks/strikethrough were not parsing at all before                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-15 | Live preview: hand-rolled CM6 mark-hiding extension (research ruled out ixora/rich-markdoc as dead, codemirror-live-markdown as alpha); ⌘P kept as reading mode with editor-matched type scale; overlay-transition WIP reverted as wrong direction                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-15 | Spec v1 (SQLite-first, keep-everything)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-15 | README + AGENTS.md rewritten for the files-first desktop app; rewrite landed as five conventional commits on feat-tauri-rewrite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-15 | Phases 0-6 built and green: Rust core (7 tests), files-first data layer, CM6 editor (focus/typewriter/wikilinks/slash), ⌘K palette, quick capture, tray; full static gate passes (format/knip/lint/tsc/vitest/build); live smoke: external write indexed <2s, delete purged, quick capture verified in-app. TanStack ESLint plugin adopted after review. Remaining: README/AGENTS rewrite, shift+/ help, tauri build bundle check                                                                                                                                                                                                         |
| 2026-08-15 | Spec v2 — pivot to files-first after scratch review; editor-first layout, CM6 editor, autosave; cut links, reminders, export/import, assets-as-blobs, profile; adopted wikilinks, slash commands, open-external, quick capture, tray, overlay chrome, autostart                                                                                                                                                                                                                                                                                                                                                                           |
