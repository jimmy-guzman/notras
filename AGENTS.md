# notras

A local-first desktop notes app -- "Just write, otra vez."

Read `SPEC.md` for the working rewrite spec (decisions, phase checklists,
manual verification walkthrough, progress log). Keep it updated as work lands.

## Tech Stack

- **Shell:** Tauri 2 (Rust) -- file IO commands, FTS5 index, notify watcher,
  tray, global shortcuts
- **Frontend:** Vite + React 19 + TanStack Router (file routes, no SSR)
- **Editor:** TipTap 3 WYSIWYG + official `@tiptap/markdown` (bidirectional
  GFM); lowlight code blocks; ⌘P raw-source textarea
- **Effect:** Effect-TS 3.x -- typed errors, Layer/DI, services, ManagedRuntime
- **Index queries:** Drizzle ORM `sqlite-proxy` (SELECT-only, see below)
- **UI:** Shadcn UI (radix-maia style, stone base) + Tailwind CSS 4
- **Formatting:** oxfmt (dev tooling); TipTap's markdown serializer is the
  runtime canonical form
- **Testing:** Vitest + happy-dom (TS), `cargo test` (Rust)
- **Package Manager:** pnpm

## Project Structure

```txt
src/
  main.tsx            # Vite entry -> App (router, or capture window branch)
  app-shell.tsx       # Router setup + ?window=capture branch
  styles.css          # Tailwind 4 theme, fonts, CM6 + titlebar styling
  routes/             # TanStack Router file routes
    __root.tsx        # loader (notes/folders/notesDir/prefs), palette,
                      # settings dialog, hotkeys, notes-changed listener
    index.tsx         # redirect to last-edited note, else empty state
    notes.$.tsx       # THE page: editor session keyed by note path
    external.tsx      # edit a markdown file outside the notes dir
  components/
    editor/           # TipTap wrapper, extensions, suggestions, autosave
    notes/            # note-header (title/tags/pin), status bar
    command-palette.tsx
    settings-dialog.tsx
    capture-window.tsx
    ui/               # Shadcn components (auto-generated, don't hand-edit)
  core/               # Isomorphic bottom layer (no platform imports)
    frontmatter.ts    # parse/serialize {pinned, tags}; preserves unknown keys
    notes.ts          # NoteMeta, NoteFilters, path/title helpers
    file-store.ts     # FileStore port (Context.Tag)
    errors.ts         # DatabaseError, FileError
    fts-markers.ts    # [[hl]] snippet markers shared with SQL
  data/               # Plain async fns the UI calls (ex-server-actions)
    run.ts            # THE Effect boundary: AppRuntime.runPromiseExit wrapper
  server/
    adapters/         # ONLY files here + runtime.ts may import @tauri-apps/*
      tauri-file-store.ts   # FileStore -> Rust commands
      tauri-database.ts     # drizzle sqlite-proxy -> db_select command
    db/               # Database tag, index schema mirror, fts-query helpers
    repositories/     # note-repository: SELECTs against the index
    schemas/          # Effect Schema validation (titles, folder names)
    services/         # note-service, format-service, app-layer
    runtime.ts        # AppRuntime (ManagedRuntime) -- wires the adapters
  lib/                # Client utilities (preferences, fts-snippet, word-count)
src-tauri/
  src/lib.rs          # setup: notes dir, index, watcher, tray, shortcuts
  src/notes.rs        # note IO commands (write/rename/delete/attach/external)
  src/index.rs        # index schema, indexer, scan, read-only select
  src/frontmatter.rs  # Rust twin of src/core/frontmatter.ts
  src/watcher.rs      # debounced notify watcher -> reindex -> event
```

## Architecture

**Files are the source of truth.** Notes are `.md` files under the notes dir
(default `~/notras`); folders are directories; `pinned`/`tags` live in YAML
frontmatter. The SQLite index at `.notras/index.db` is derived and disposable
-- deleting it triggers a rebuild on launch.

- **Rust is the single writer of the index.** Every TS mutation goes through a
  Rust command (`write_note`, `rename_note`, `delete_note`, ...) that writes
  the file and updates the index in the same call, then emits `notes-changed`.
  The `db_select` command rejects anything that is not SELECT/WITH. Never add
  an index write path from TypeScript.
- **External writers** (AI agents, other editors, git) are reconciled by the
  debounced watcher; the mtime skip in `index_file` keeps self-writes from
  echoing. UI refresh is event-driven: the root route listens for
  `notes-changed` and calls `router.invalidate()`.
- **Note identity is the relative path.** The filename is the title; renames
  are delete+create in the index. Wikilinks resolve by title, so renames can
  dangle links (accepted).
- **Frontmatter parity:** `src/core/frontmatter.ts` and
  `src-tauri/src/frontmatter.rs` implement the same deliberately tiny dialect
  (`pinned: bool`, `tags` inline or block list). Change one, change the other,
  and cover both with tests. The TS serializer preserves unknown keys
  verbatim -- externally-authored notes must survive round-trips.

### Layer boundaries

Enforced by two `no-restricted-imports` blocks at the bottom of
`eslint.config.ts` -- they must stay last (flat config replaces rule options)
and the fix is never to widen the glob:

- **`src/core/**`** is isomorphic: no `@tauri-apps/*`, `react`, `node:*`, and
  no upward imports from `@/server`, `@/lib`, `@/components`, `@/data`.
- **`src/server/{db,repositories,schemas,services}/**`** is platform-free: no
  `@tauri-apps/*` or React. Inject behavior through the ports instead
  (`FileStore` in `src/core`, `Database` in `src/server/db`). Only
  `src/server/adapters/**` and `src/server/runtime.ts` may import
  `@tauri-apps/*`.
- UI code (`src/components`, `src/routes`, `src/lib`) may use `@tauri-apps/*`
  for UI concerns (events, dialogs, window control, preferences store) but
  never for note file IO or SQL -- that goes through `src/data`.

## Key Patterns

- **Data access:** UI calls plain async functions in `src/data/` (one concern
  per file). They validate with Effect Schema where input is user-shaped and
  run Effects via `run()` from `src/data/run.ts` -- the only place
  `AppRuntime` is executed. `run()` unwraps typed failures into plain `Error`s
  so callers can `toast.error(error.message)`.
- **Effect style:** `ServiceTag.pipe(Effect.flatMap((svc) => svc.method(...)))`
  -- never `Effect.flatMap(Tag, fn)` (trips
  `unicorn/no-array-method-this-argument`). Services convert `DatabaseError`
  to defects via `.pipe(Effect.orDie)`; `FileError` stays typed because its
  message is user-facing.
- **Routes:** TanStack Router file routes. `export const Route` sits at the
  top of the file; components are function declarations below (hoisting makes
  this lint-clean). `@tanstack/eslint-plugin-router` owns route-option
  ordering (`create-route-property-order`), and `perfectionist/sort-objects`
  is configured to leave `Route` option objects unsorted -- do not fight
  either rule.
- **The editor owns its buffer.** `Editor` (TipTap wrapper) freezes all
  props except the writing-mode toggles at mount via a `useState`
  initializer; loading different content means remounting via `key`.
  Callbacks passed to it must be freeze-safe: read live values through
  refs/stable getters, never closures over render state.
- **Body-only editing.** The editor holds the note BODY as markdown;
  frontmatter is parsed off at load (`parseNote`) and reattached at save
  (`composeNote`), always from the LATEST loader snapshot so pin/tag
  toggles are never clobbered by a body save. ⌘P is a raw-source textarea
  over the full file.
- **Markdown round-trip contract.** `markdown-roundtrip.spec.ts` pins the
  set of constructs that must survive file -> editor -> file. Extend it
  when adding nodes; custom syntax uses the extension-config trio
  `markdownTokenName`/`markdownTokenizer`/`parseMarkdown`/`renderMarkdown`
  (see `wikilink.ts`).
- **Editing session per note:** `notes.$.tsx` renders `<NoteEditor
key={note.path}>` so autosave state can never leak across notes. Autosave
  (`use-autosave.ts`) debounces 800ms and flushes on blur/unmount.
- **External-change reload guard:** a loader refresh replaces the buffer only
  when it is clean AND the file's mtime is newer than our own last write
  (`lastSavedAtRef`) -- a stale loader snapshot of a just-saved note must
  never clobber the buffer. Don't simplify this check away.
- **Adding a Rust command:** define in `src-tauri/src/notes.rs` (or a new
  module), register in `generate_handler!` in `lib.rs`, expose through the
  `FileStore` port + `tauri-file-store.ts` adapter if it is note IO. Commands
  that mutate must index synchronously and `emit_changed`.
- **Palette:** `command-palette.tsx` is the action surface (search, tag
  filter via `#`, pin/move/delete/reveal, settings, reindex). New note-level
  actions belong here, not in new chrome.
- **Preferences:** `@tauri-apps/plugin-store` via `src/lib/preferences.ts`
  (`settings.json`, shared with Rust's `notesDir`).
- **Snippet rendering:** FTS snippets use `[[hl]]`/`[[/hl]]` markers parsed by
  `getSnippetParts` -- never `dangerouslySetInnerHTML`.

## Commands

```txt
pnpm dev          # run the desktop app (tauri dev)
pnpm build        # desktop bundle (tauri build)
pnpm dev:web      # web shell only (vite, port 1420)
pnpm build:web    # web shell build
pnpm lint         # ESLint (cached)     | pnpm lint:fix
pnpm format       # oxfmt check         | pnpm format:fix
pnpm typecheck    # tsc
pnpm test         # vitest              | pnpm coverage
pnpm knip         # unused code/deps
cargo test        # (in src-tauri/) Rust unit tests
```

## Verification

After **every** set of changes, run all of these before considering the task
done:

```txt
pnpm knip         # 0. unused code/deps (fix before proceeding)
pnpm typecheck    # 1. types
pnpm lint         # 2. lint
pnpm test         # 3. unit tests
pnpm build:web    # 4. web bundle build
cargo test        # 5. (when src-tauri changed) in src-tauri/
```

For anything touching the Rust side or window behavior, also launch
`pnpm dev` and walk the relevant steps of the SPEC.md verification list --
there is no automated e2e (wdio + tauri-driver is a named follow-up).

## Conventions

- Path alias `@/*` -> `./src/*`.
- Components use Shadcn primitives from `@/components/ui/` (add via
  `pnpm dlx shadcn@latest add <component>`; never hand-edit generated files --
  fix non-autofixable lint via the `**/components/ui/**` override block).
  One documented exception: `command.tsx` moves the sr-only `DialogHeader`
  inside `DialogContent`. Radix portals the content, so upstream's placement
  leaves `aria-labelledby` pointing outside the dialog. Re-apply it if you
  ever re-add the component.
- `cn()` from `@/lib/ui/utils` for conditional Tailwind classes.
- Icons from `lucide-react`, always the `Icon`-suffixed export.
- Effect Schema (not zod) for validation, in `src/server/schemas/`.
- Test files use `.spec.ts` and live next to the code they test; titles start
  with "should". Rust tests live in `#[cfg(test)]` modules in the same file.
- Sort object keys and imports alphabetically (perfectionist) -- except route
  option objects, which the router plugin owns.
- Prefer named exports; bottom-up file layout (helpers above, public API at
  the bottom) -- except route files, where `Route` sits at the top.
- **Lowercase aesthetic:** all user-facing text is lowercase -- labels,
  buttons, toasts, tooltips, placeholders. Deliberate, app-wide.
- Title = filename. There is no title field in note content; deriving titles
  from content is a web-era pattern that no longer exists.

## Do NOT

- Write to the index from TypeScript, or add non-SELECT support to
  `db_select`. Rust is the only writer.
- Import `@tauri-apps/*` outside `src/server/adapters/**`, `runtime.ts`, and
  UI-concern code -- and never widen the boundary globs in `eslint.config.ts`.
- Change one frontmatter parser without the other (TS + Rust must stay in
  parity, with tests).
- Add editor nodes without markdown serialization: every node must define
  its markdown form and be covered by the round-trip spec, or externally
  authored files can lose content.
- Use Prettier -- this project uses oxfmt (dev tooling only).
- Add unnecessary dependencies; run `pnpm knip` and leave it clean.
- Reach for `as`, `!`, or `any` before exhausting proper typing.
- Silence lint errors with config overrides (exceptions: the Shadcn
  `**/components/ui/**` block and the documented TanStack Router
  accommodations).
- Leave tests, lint, typecheck, knip, or the build red.
- Forget docs -- after a new pattern, feature, or structural change, update
  `SPEC.md` and ask whether `AGENTS.md`/`README.md` should change too.

## Branching & Commits

- **Branch naming:** `{type}-{short-description}` kebab-case (`feat-`, `fix-`,
  `refactor-`, `chore-`, `docs-`, `ci-`).
- **Commits:** use `pnpm gitzy commit` (Conventional Commits + emoji,
  lowercase subjects under 50 chars, body wrapped at 72). Inline flags:
  `pnpm gitzy commit --type feat --scope ui -m "subject" --body "..."
--co-author "Name <email>"`; `-D` for a dry run.
- **Pull requests:** branch off `main`, `gh pr create`, conventional title.
  Squash merge only. Never commit directly to `main`.
