![notras: just write, otra vez.](assets/hero.png)

# notras

A local-first, keyboard-driven notes app for the desktop. Your notes are plain markdown files in a folder you own, so there is no account to make and no database to export from.

## Your notes are files

notras reads `.md` and `.markdown` files under a folder you pick (default `~/notras`) and writes new ones as `.md`. Folders are real directories, tags and pins are YAML frontmatter, attachments are plain files.

- **Any tool works.** Edit a note in vim, sync the folder with git or iCloud, grep it from a terminal.
- **AI agents are first-class writers.** Point Claude Code at the folder, and a Rust file watcher picks up what it writes so the app refreshes within a second.

Search runs on a SQLite FTS5 index derived from those files. The index is disposable, and [ARCHITECTURE.md](ARCHITECTURE.md) covers how it is built and rebuilt.

## Features

- editor-first window: WYSIWYG markdown (TipTap 3) over plain `.md`, set in Literata
- tabs in the title bar: several notes open at once, each with its own undo history and caret, and the set comes back when you relaunch
- autosave on idle, writing clean canonical markdown back to the file
- ⌘K command palette: full-text search with highlighted snippets, `#tag` filters that narrow it (`#work budget`), and every note action
- ⌘P raw markdown source mode, the escape hatch for anything exotic
- wikilinks `[[note title]]` as clickable pills, with autocomplete
- slash commands: `/` inserts headings, lists, task lists, quotes, code blocks, tables, dividers, and today's date
- editable tables, clickable task checkboxes, inline images, and code blocks with copy and a language picker, all round-tripping through GFM markdown
- ⌘⇧K to add or edit a link, and ⌘-click a web link to open it in your browser
- tags, pins, and folders; move a note between folders from the palette
- ⌘D focus mode dims every paragraph but the one you are in, and typewriter scrolling is a separate toggle in the status strip
- drag a file onto a note and it lands in `attachments/`, with a markdown link inserted
- global quick capture: ⌘⇧N from any app, jot, esc saves it to `inbox/`
- menu-bar tray and launch at login
- "Open With" opens external markdown files, as many at once as you pick (macOS)
- word count and reading time in the status strip, lowercase chrome, and light or dark from the system

## Install

```bash
brew install --cask jimmy-guzman/tap/notras
```

notras updates itself once installed. Or download an installer from [releases](https://github.com/jimmy-guzman/notras/releases): `.dmg` on macOS, `.AppImage`, `.deb` or `.rpm` on Linux, `.msi` or `.exe` on Windows. Every release carries a `SHA256SUMS.txt` alongside them, so check what you got:

```bash
shasum -a 256 -c SHA256SUMS.txt --ignore-missing   # macOS
sha256sum -c SHA256SUMS.txt --ignore-missing       # Linux
```

`--ignore-missing` matters: the file lists every platform's artifact, so without it the check fails on the ones you did not download. This catches a truncated or corrupted transfer. It is not a signature, since the sums sit on the same release as the files.

Builds are not yet signed with an Apple Developer ID, so macOS quarantines the app on first launch. Clear it with:

```bash
xattr -dr com.apple.quarantine /Applications/notras.app
```

## Keyboard shortcuts

| Shortcut  | Action                           |
| --------- | -------------------------------- |
| `⌘K`      | command palette (search + acts)  |
| `⌘N`/`⌘T` | new note, in a new tab           |
| `⌘⏎`      | (palette) open in a new tab      |
| `⌘W`      | close tab                        |
| `⌘⇧T`     | reopen the last closed tab       |
| `⌘1`-`⌘9` | nth tab; `⌘9` is the last one    |
| `⌃⇥`      | next tab (`⌃⇧⇥` for previous)    |
| `⌘⌥→`     | next tab (`⌘⌥←` for previous)    |
| `⌘⌥⇧→`    | move the tab right (`⌘⌥⇧←` left) |
| `⌘P`      | toggle raw markdown source       |
| `⌘D`      | toggle focus mode                |
| `⌘⇧K`     | add / edit link                  |
| `⌘⇧Y`     | edit tags                        |
| `⌘,`      | settings                         |
| `⌘⇧N`     | global quick capture             |
| `esc`     | (capture window) save + hide     |
| `⌘⏎`      | (capture window) save + hide     |

`⌘P` and `⌘D` act on the tab that is showing, and `⌘⇧Y` also needs that tab to hold a note, since a file opened from outside your library has no frontmatter to tag. All of them do nothing on the empty state, which is where closing the last tab lands you. The capture window runs outside the router, so the palette and tab shortcuts above never reach it; `esc`, `⌘⏎`, and the editor's own keys do.

## Development

You need Node (`.nvmrc` pins v24.19.0), [pnpm](https://pnpm.io), and a [Rust toolchain](https://www.rust-lang.org/tools/install). Corepack reads the pinned pnpm version out of `package.json`:

```bash
corepack enable
pnpm install
pnpm dev
```

On first launch notras creates `~/notras` and seeds the index. Change the folder any time in settings (⌘,).

| Script            | Description                          |
| ----------------- | ------------------------------------ |
| `pnpm dev`        | run the desktop app (`tauri dev`)    |
| `pnpm build`      | build the desktop bundle             |
| `pnpm dev:web`    | run only the web shell (Vite)        |
| `pnpm build:web`  | build only the web shell             |
| `pnpm check`      | lint and format check (Ultracite)    |
| `pnpm fix`        | lint and format, auto-fixing         |
| `pnpm typecheck`  | type check (tsc)                     |
| `pnpm test`       | run tests (Vitest, watches)          |
| `pnpm coverage`   | tests with coverage                  |
| `pnpm knip`       | detect unused code/deps              |
| `pnpm icons`      | regenerate app icons from `assets/`  |
| `pnpm actions:up` | update the SHA-pinned GitHub Actions |
| `pnpm deps:up`    | interactive dependency upgrade       |
| `pnpm clean`      | remove build output                  |
| `pnpm prepare`    | install the git hooks (lefthook)     |
| `pnpm tauri`      | run the tauri cli directly           |

Rust tests live in `src-tauri`: `cargo test --locked`.

## Technologies

[Tauri](https://tauri.app) 2 over [rusqlite](https://github.com/rusqlite/rusqlite) and [notify](https://github.com/notify-rs/notify); [Vite](https://vite.dev) 8 with [React](https://react.dev) 19 and [TanStack Router](https://tanstack.com/router); [TipTap](https://tiptap.dev) 3 with [`@tiptap/markdown`](https://tiptap.dev/docs/editor/markdown); [Effect](https://effect.website) 4, still a release candidate; [Drizzle ORM](https://orm.drizzle.team) over SQLite FTS5; [Shadcn UI](https://ui.shadcn.com) on [Base UI](https://base-ui.com) with [Tailwind CSS](https://tailwindcss.com) 4.

## Docs

| Doc                                | What it holds                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The stack, the index schema, project structure, layer boundaries, patterns, invariants |
| [DESIGN.md](DESIGN.md)             | Typography, color, space, motion, interaction, the editor surface, copy                |
| [DECISIONS.md](DECISIONS.md)       | A log of decisions, each with its rationale and what it rejected                       |
| [SPEC.md](SPEC.md)                 | What the app does, as claims you can check against a running build                     |
| [DEFERRED.md](DEFERRED.md)         | Work ruled out rather than done, each entry with its reason                            |
| [AGENTS.md](AGENTS.md)             | The rules for changing any of it, and the map of which doc holds which fact            |

## License

[MIT](LICENSE)
