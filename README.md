# notras

> Just write, otra vez.

A local-first, keyboard-driven notes app for your desktop. Your notes are plain
markdown files in a folder you own: no accounts, no cloud, no database to
export from. The window is the editor; everything else is a keystroke away.

## Your notes are files

notras stores every note as a `.md` file (default: `~/notras`). Folders are
real directories, tags and pins are YAML frontmatter, attachments are plain
files. That one decision buys a lot:

- **any tool works.** Edit notes in vim, sync the folder with git or iCloud,
  grep them from a terminal
- **AI agents are first-class writers.** Point Claude Code (or any agent) at
  the folder; when it writes a markdown file, a Rust file watcher picks it up
  and the app refreshes within a second. The filesystem is the API.
- **backups are `cp -r`.** There is nothing to export

Search stays fast because a derived SQLite FTS5 index lives at
`.notras/index.db` inside the folder. It is disposable: delete it and the app
rebuilds it from your files on the next launch.

## Features

- editor-first window: true WYSIWYG markdown (TipTap 3) that reads and
  writes plain `.md`, set in iA Writer Quattro
- autosave on idle; what lands on disk is clean, canonical markdown
- ⌘K command palette: full-text search (FTS5, bm25, highlighted snippets),
  `#tag` filters, and every note action
- ⌘P raw markdown source mode (the escape hatch for anything exotic)
- wikilinks `[[note title]]` as clickable pills with autocomplete
- slash commands: `/` inserts headings, lists, task lists, code blocks,
  tables, quotes, dividers, today's date
- focus mode (⌘D, dims all but the active paragraph) and typewriter scrolling
- editable tables, clickable task checkboxes, inline images, code blocks
  with copy + language picker, all round-tripping through GFM markdown
- links: ⌘⇧K to add/edit, ⌘-click to open in your browser
- tags, pins, and folders; move notes between folders from the palette
- drag any file in -> copied to `attachments/`, markdown link inserted
- global quick capture: ⌘⇧N from anywhere -> jot -> esc saves to `inbox/`
- menu-bar tray, launch at login, macOS overlay title bar
- "Open With" any external `.md` file
- word count + reading time; lowercase everything; dark/light via system

## Technologies

- [Tauri](https://tauri.app) 2 (Rust shell: file watcher, FTS5 index, tray,
  global shortcuts)
- [rusqlite](https://github.com/rusqlite/rusqlite) (bundled SQLite + FTS5) +
  [notify](https://github.com/notify-rs/notify)
- [Vite](https://vite.dev) + [React](https://react.dev) 19 +
  [TanStack Router](https://tanstack.com/router)
- [TipTap 3](https://tiptap.dev) + official bidirectional
  [`@tiptap/markdown`](https://tiptap.dev/docs/editor/markdown) (editor)
- [Effect](https://effect.website) 4 (typed errors, Layer/DI, services)
- [Drizzle ORM](https://orm.drizzle.team) (`sqlite-proxy`, read-only queries
  against the index)
- [Shadcn UI](https://ui.shadcn.dev) + [Tailwind CSS](https://tailwindcss.com) 4

## Architecture

Files are the source of truth. TypeScript never writes SQL. Every mutation is a
Rust command that writes the file and updates the index in the same call, and
external writes are reconciled by a watcher that pushes `notes-changed` events
to the UI.

[ARCHITECTURE.md](ARCHITECTURE.md) holds the diagram, the layer boundaries, the
key patterns, and the invariants.

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) is how the system is built: stack,
  structure, boundaries, patterns, index schema, invariants.
- [DESIGN.md](DESIGN.md) is the interface conventions the app is built to.
- [DECISIONS.md](DECISIONS.md) is every decision with its rationale and what it
  rejected.
- [SPEC.md](SPEC.md) is the working document for the rewrite: phase checklists,
  the manual verification walkthrough, deferred work, and the progress log.
- [AGENTS.md](AGENTS.md) is the conventions for anyone, human or agent, changing
  this repo.

## Getting started

You need [pnpm](https://pnpm.io) and a
[Rust toolchain](https://www.rust-lang.org/tools/install):

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
```

Run the app:

```bash
pnpm dev
```

On first launch notras creates `~/notras` and seeds the index. Change the
folder any time in settings (⌘,).

## Scripts

| Script            | Description                       |
| ----------------- | --------------------------------- |
| `pnpm dev`        | run the desktop app (`tauri dev`) |
| `pnpm build`      | build the desktop bundle          |
| `pnpm dev:web`    | run only the web shell (Vite)     |
| `pnpm build:web`  | build only the web shell          |
| `pnpm lint`       | lint (ESLint, cached)             |
| `pnpm lint:fix`   | lint and auto-fix                 |
| `pnpm format`     | check formatting (oxfmt)          |
| `pnpm format:fix` | fix formatting                    |
| `pnpm typecheck`  | type check (tsc)                  |
| `pnpm test`       | run tests (Vitest)                |
| `pnpm coverage`   | tests with coverage               |
| `pnpm knip`       | detect unused code/deps           |

Rust tests live in `src-tauri`: `cargo test`.

## Keyboard shortcuts

| Shortcut | Action                          |
| -------- | ------------------------------- |
| `⌘K`     | command palette (search + acts) |
| `⌘N`     | new note                        |
| `⌘P`     | toggle raw markdown source      |
| `⌘D`     | toggle focus mode               |
| `⌘⇧K`    | add / edit link                 |
| `⌘,`     | settings                        |
| `⌘⇧N`    | global quick capture            |
| `esc`    | (capture window) save + hide    |
