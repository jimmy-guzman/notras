![notras: write another note.](assets/hero.png)

# notras

A local-first, keyboard-driven notes app for the desktop. Your notes are plain markdown files in a folder you own, so there is no account to make and no database to export from.

## Your notes are files

notras reads `.md` and `.markdown` files under a folder you pick, `~/notras` by default, and writes new ones as `.md`.

- folders are real directories
- tags and pins are YAML frontmatter
- attachments are plain files

Because the folder is plain files:

- **Any tool works.** Edit a note in vim, sync the folder with git or iCloud, grep it from a terminal.
- **AI agents write straight into the folder.** Point Claude Code at it. A Rust file watcher picks up what it writes, and the app refreshes within a second.

The folder is trusted input. Anything that can write to it can change what notras shows, and the app grants itself read access to the whole folder so attachments render. Share it only with people and jobs you trust, and set filesystem permissions to match.

Unsaved edits win over an agent's write. A note open in notras keeps your buffer, and the next save overwrites what the agent put there. [SPEC.md](SPEC.md#external-changes) has the rule.

Search and mentions run on a SQLite index derived from those files: FTS5 over the text, and a row for every `[[wikilink]]`. The index is disposable, and [ARCHITECTURE.md](ARCHITECTURE.md) covers how it is built and rebuilt.

## Features

### Writing

- WYSIWYG markdown over plain `.md`, set in Literata
- autosave on idle, writing clean canonical markdown back to the file
- the `/` slash menu inserts headings, lists, task lists, quotes, code blocks, tables, dividers, and today's date
- editable tables, clickable task checkboxes, and inline images
- code blocks with a copy button and a language picker
- all of it round-trips through GFM markdown
- `⌘E` swaps to raw markdown source, the escape hatch for anything exotic
- `⌘D` focus mode dims every block but the one you are in, and a wheel or touch scroll lifts the dim
- `⌘⌥T` typewriter scrolling keeps the line you are typing vertically centred
- word count and reading time, in the status strip

### Finding

- `⌘P` finds a note, over full-text search with highlighted snippets
- `#tag` filters that narrow the search (`#work budget`)
- a search that matches nothing offers to create a note under the name you typed
- `⌘⇧P` runs an action on the note, the open tabs, or the app itself
- `[[note title]]` wikilinks as clickable pills, with autocomplete
- the status strip counts the notes that mention the one you are in, by `[[link]]` or by writing its title, and lists them with the line that did it. Other apps call the linked ones backlinks
- `⌘⇧G` swaps the note for its graph: the note in the centre, what mentions it on the left, what it links to on the right, arrows to walk it and `⏎` to hop
- `⌘⇧K` adds or edits a link, and `⌘`-click opens a web link in your browser
- tags, pins, and folders, with moves between folders run from `⌘⇧P`

### Tabs

- several notes open at once, in the title bar
- each tab keeps its own undo history and caret
- the open set comes back when you relaunch

### Files and the system

- drag a file onto a note: it lands in `attachments/`, with a markdown link inserted
- quick capture: `⌘⇧N` from any app, jot, `esc` saves it to `inbox/`
- "Open With" opens external markdown files, as many at once as you pick (macOS)
- menu-bar tray and launch at login
- lowercase chrome, and light or dark from the system

## Install

```bash
brew install --cask jimmy-guzman/tap/notras
```

notras checks for updates on launch. A new version arrives as a toast with an install button, and nothing installs until you press it.

Or download an installer from [releases](https://github.com/jimmy-guzman/notras/releases):

- `.dmg` on macOS
- `.AppImage`, `.deb` or `.rpm` on Linux
- `.msi` or `.exe` on Windows

Every release carries a `SHA256SUMS.txt` alongside them, so check what you got:

```bash
shasum -a 256 -c SHA256SUMS.txt --ignore-missing   # macOS
sha256sum -c SHA256SUMS.txt --ignore-missing       # Linux
```

`--ignore-missing` matters. The file lists every platform's artifact, so without it the check fails on the ones you did not download.

This catches a truncated or corrupted transfer. It is not a signature, since the sums sit on the same release as the files.

Builds are not yet signed with an Apple Developer ID, so macOS quarantines the app on first launch.

Clearing that flag turns off Gatekeeper's check for this app, so run the checksum above first and only clear it if you trust what you downloaded:

```bash
xattr -dr com.apple.quarantine /Applications/notras.app
```

Signing and notarization are tracked in [DEFERRED.md](DEFERRED.md).

## Keyboard shortcuts

| Shortcut  | Action                           |
| --------- | -------------------------------- |
| `⌘P`      | find a note                      |
| `⌘⇧P`     | run an action                    |
| `⌘N`/`⌘T` | new note, in a new tab           |
| `⌘⏎`      | (palette) open in a new tab      |
| `⌘W`      | close tab                        |
| `⌘⌥⇧W`    | close other tabs                 |
| `⌘⇧T`     | reopen the last closed tab       |
| `⌘1`-`⌘9` | nth tab; `⌘9` is the last one    |
| `⌃⇥`      | next tab (`⌃⇧⇥` for previous)    |
| `⌘⌥→`     | next tab (`⌘⌥←` for previous)    |
| `⌘⌥⇧→`    | move the tab right (`⌘⌥⇧←` left) |
| `⌘E`      | toggle raw markdown source       |
| `⌘D`      | toggle focus mode                |
| `⌘⌥T`     | toggle typewriter scrolling      |
| `⌘⇧G`     | toggle graph view                |
| `⌥↑`/`⌥↓` | move the selected blocks         |
| `⌘⇧K`     | add / edit link                  |
| `⌘⇧L`     | show mentions                    |
| `⌘⇧Y`     | edit tags                        |
| `⌘,`      | settings                         |
| `⌘⇧N`     | global quick capture             |
| `esc`     | (capture window) save + hide     |
| `⌘⏎`      | (capture window) save + hide     |

- `⌘E` and `⌘⌥⇧W` act on the tab that is showing.
- `⌘⇧Y`, `⌘⇧L` and `⌘⇧G` need that tab to hold a note. A file opened from outside your library has no frontmatter to tag and no place in the index to be mentioned from or drawn from.
- None of those does anything on the empty state, which is where closing the last tab lands you.
- `⌘D` and `⌘⌥T` set the writing mode, which belongs to the app rather than a note, so they work with nothing open and the next note you create is already in it.
- The capture window runs outside the router, so the palette and tab shortcuts never reach it. `esc`, `⌘⏎`, and the editor's own keys do.

## Development

You need three things:

- Node, which `.nvmrc` pins to v24.19.0
- [pnpm](https://pnpm.io), whose version corepack reads out of `package.json`
- a [Rust toolchain](https://www.rust-lang.org/tools/install)

Then:

```bash
corepack enable
pnpm install
pnpm dev
```

On first launch notras creates `~/notras` and seeds the index. Change the folder any time in settings (⌘,).

| Script           | Description                         |
| ---------------- | ----------------------------------- |
| `pnpm dev`       | run the desktop app (`tauri dev`)   |
| `pnpm build`     | build the desktop bundle            |
| `pnpm dev:web`   | run only the web shell (Vite)       |
| `pnpm build:web` | build only the web shell            |
| `pnpm check`     | lint and format check (Ultracite)   |
| `pnpm fix`       | lint and format, auto-fixing        |
| `pnpm typecheck` | type check (tsc)                    |
| `pnpm test`      | run tests (Vitest, watches)         |
| `pnpm coverage`  | tests with coverage                 |
| `pnpm knip`      | unused code/deps, test-only exports |
| `pnpm icons`     | regenerate app icons from `assets/` |
| `pnpm clean`     | remove build output                 |
| `pnpm prepare`   | install the git hooks (lefthook)    |
| `pnpm tauri`     | run the tauri cli directly          |

Rust tests live in `src-tauri`: `cd src-tauri && cargo test --locked`.

## Technologies

- [Tauri](https://tauri.app) 2
- [rusqlite](https://github.com/rusqlite/rusqlite)
- [notify](https://github.com/notify-rs/notify)
- [Vite](https://vite.dev) 8
- [React](https://react.dev) 19
- [TanStack Router](https://tanstack.com/router)
- [TipTap](https://tiptap.dev) 3
- [`@tiptap/markdown`](https://tiptap.dev/docs/editor/markdown)
- [Effect](https://effect.website) 4 (release candidate)
- [Drizzle ORM](https://orm.drizzle.team)
- [SQLite](https://sqlite.org) FTS5
- [Shadcn UI](https://ui.shadcn.com)
- [Base UI](https://base-ui.com)
- [Tailwind CSS](https://tailwindcss.com) 4

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
