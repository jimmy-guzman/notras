# notras

> Just write, otra vez.

A local-first, keyboard-driven notes app for your desktop. Your notes are plain
markdown files in a folder you own -- no accounts, no cloud, no database to
export from. The window is the editor; everything else is a keystroke away.

## Your notes are files

notras stores every note as a `.md` file (default: `~/notras`). Folders are
real directories, tags and pins are YAML frontmatter, attachments are plain
files. That one decision buys a lot:

- **any tool works** -- edit notes in vim, sync the folder with git or iCloud,
  grep them from a terminal
- **AI agents are first-class writers** -- point Claude Code (or any agent) at
  the folder; when it writes a markdown file, a Rust file watcher picks it up
  and the app refreshes within a second. The filesystem is the API.
- **backups are `cp -r`** -- there is nothing to export

Search stays fast because a derived SQLite FTS5 index lives at
`.notras/index.db` inside the folder. It is disposable: delete it and the app
rebuilds it from your files on the next launch.

## Features

- editor-first window: CodeMirror 6 markdown source with live styling
  (iA Writer model), set in iA Writer Quattro
- autosave on idle; markdown formatted on blur (never while you type)
- ⌘K command palette: full-text search (FTS5, bm25, highlighted snippets),
  `#tag` filters, and every note action
- ⌘P rendered preview with GFM + syntax-highlighted code blocks
- wikilinks `[[note title]]` with autocomplete; clickable in preview
- slash commands: `/` at a line start inserts headings, task lists, code
  blocks, tables, today's date
- focus mode (⌘D, dims all but the active paragraph) and typewriter scrolling
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
- [CodeMirror 6](https://codemirror.net) (editor) +
  [react-markdown](https://github.com/remarkjs/react-markdown) /
  [rehype-expressive-code](https://expressive-code.com) (preview)
- [Effect](https://effect.website) 3.x (typed errors, Layer/DI, services)
- [Drizzle ORM](https://orm.drizzle.team) (`sqlite-proxy`, read-only queries
  against the index)
- [Shadcn UI](https://ui.shadcn.dev) + [Tailwind CSS](https://tailwindcss.com) 4
- [remark](https://remark.js.org) (format-on-blur)

## Architecture

```mermaid
flowchart TD
    subgraph webview [Tauri webview]
        UI[React + TanStack Router] --> Data[src/data async fns]
        Data --> Services[Effect services]
        Services --> FileStore[FileStore port]
        Services --> Index[Database port -- read-only]
    end

    subgraph rust [Rust: single writer of the index]
        Commands[note IO commands] --> Files[(~/notras/**/*.md)]
        Commands --> IndexDb[(.notras/index.db FTS5)]
        Watcher[notify watcher] --> IndexDb
        Files -.external edits.-> Watcher
    end

    FileStore --> Commands
    Index --> IndexDb
    Agents[any editor / git / AI agent] -.write .md.-> Files
    Watcher -. notes-changed event .-> UI
```

Files are the source of truth. TypeScript never writes SQL -- every mutation
is a Rust command that writes the file and updates the index atomically;
external writes are reconciled by the watcher and pushed to the UI as
`notes-changed` events.

## Getting Started

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

## Keyboard Shortcuts

| Shortcut | Action                          |
| -------- | ------------------------------- |
| `⌘K`     | command palette (search + acts) |
| `⌘N`     | new note                        |
| `⌘P`     | toggle rendered preview         |
| `⌘D`     | toggle focus mode               |
| `⌘,`     | settings                        |
| `⌘⇧N`    | global quick capture            |
| `esc`    | (capture window) save + hide    |
