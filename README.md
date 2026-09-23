![notras: write another note](assets/hero.png)

# notras

A keyboard-driven notes app for the desktop. Your notes are markdown files in a folder you own.

## Your notes are files

notras reads `.md` and `.markdown` files under a folder you pick, `~/notras` by default, and writes new ones as `.md`. Tags and pins are YAML frontmatter. Attachments are files in `attachments/`.

An agent like Claude Code can write straight into the folder, and the app picks up the change within about a second. If a file changes under a note you are editing, the two versions are combined line by line, and edits to the same lines wait for you to review them.

The app reads the whole folder so attachments render. Share it only with people and jobs you trust.

Search runs on a SQLite index built from the files. Delete it and the next launch rebuilds it.

## Features

### Writing

- WYSIWYG markdown, saved back as clean GFM
- autosave when you stop typing
- `/` menu for headings, lists, task lists, quotes, code blocks, tables, dividers, and today's date
- images, and code blocks with a copy button and a language picker
- `⌘E` raw markdown source
- `⌘D` focus mode: dims every block but the one you are in and keeps your line centred
- `⌘F` finds text in the note
- word count in the status strip

### Finding

- `⌘P` full-text search with highlighted snippets
- filters: `#tag`, `folder:path`, `to:note.md`, `from:note.md`, `mention:"a phrase"`, `link:github.com`
- a search without filters that matches nothing offers to create a note under that name
- `⌘⇧P` runs an action
- `[[wikilinks]]` with autocomplete, and `[text](other.md)` links between notes
- the status strip counts the notes that mention the one you are in, and lists them
- `⌘⌥G` shows the note as a graph: what mentions it, what it links to, its folder and tags
- tags, pins, and folders

### Tabs

- several notes open at once, in the title bar
- each tab keeps its own undo history
- a new note is a blank tab until you type: close it untouched and no file is left behind
- the heading is the filename: rename one and the other follows
- the open set comes back when you relaunch

### Files and the system

- drop a file on a note: it lands in `attachments/` with a link inserted
- `⌘⇧N` quick capture from any app, and `esc` saves it as a new note
- "Open With" opens markdown files from outside the folder (macOS)
- export a note as a PDF (macOS)
- menu-bar tray and launch at login
- light or dark, from the system

## Install

```bash
brew install --cask jimmy-guzman/tap/notras
```

Or download an installer from [releases](https://github.com/jimmy-guzman/notras/releases):

- `.dmg` on macOS
- `.AppImage`, `.deb` or `.rpm` on Linux
- `.msi` or `.exe` on Windows

notras needs macOS 26 or later. The build is universal. Linux support covers the Ubuntu release of GitHub Actions' `ubuntu-latest` runner, with current updates. Older Ubuntu releases and other distributions are unsupported.

Each release carries `SHA256SUMS.txt`. Check what you downloaded:

```bash
shasum -a 256 -c SHA256SUMS.txt --ignore-missing   # macOS
sha256sum -c SHA256SUMS.txt --ignore-missing       # Linux
```

`--ignore-missing` skips the platforms you did not download. It is not a signature, since the sums sit on the same release as the files.

Builds are not signed with an Apple Developer ID yet, so macOS quarantines the app on first launch. Clearing the flag skips Gatekeeper for this app, so run the checksum first:

```bash
xattr -dr com.apple.quarantine /Applications/notras.app
```

Signing is tracked in [issue #171](https://github.com/jimmy-guzman/notras/issues/171).

notras checks for updates on launch. A new version shows a toast with an install button.

## Keyboard shortcuts

| Shortcut     | Action                           |
| ------------ | -------------------------------- |
| `⌘\`         | toggle the note browser          |
| `⌘P`         | find a note                      |
| `⌘⇧P`        | run an action                    |
| `⌘N`         | new note, in a new tab           |
| `⌘⏎`         | (palette) open in a new tab      |
| `⌘W`         | close tab                        |
| `⌘⌥⇧W`       | close other tabs                 |
| `⌘⇧T`        | reopen the last closed tab       |
| `⌘1`-`⌘9`    | nth tab; `⌘9` is the last one    |
| `⌃⇥`         | next tab (`⌃⇧⇥` for previous)    |
| `⌘⌥→`        | next tab (`⌘⌥←` for previous)    |
| `⌘⌥⇧→`       | move the tab right (`⌘⌥⇧←` left) |
| `⌘E`         | toggle raw markdown source       |
| `⌘D`         | toggle focus mode                |
| `⌘F`         | find in the current buffer       |
| `⌘G` / `⌘⇧G` | next / previous match            |
| `⌘⌥G`        | toggle graph view                |
| `⌥↑`/`⌥↓`    | move the selected blocks         |
| `⇧⏎`         | line break inside the block      |
| `⌘⇧K`        | add / edit link                  |
| `⌘⇧O`        | open the link at the caret       |
| `⌘⇧L`        | show mentions                    |
| `⌘⇧Y`        | edit tags                        |
| `⌘⇧D`        | pin or unpin the note            |
| `⌘,`         | settings                         |
| `⌘⇧N`        | global quick capture             |
| `esc`        | (capture window) save + hide     |
| `⌘⏎`         | (capture window) save + hide     |
| `esc`        | (review) back to the note        |
| `⌘⏎`         | (review) resolve                 |

- `⌘⇧D`, `⌘⇧Y`, `⌘⇧L` and `⌘⌥G` need a note from your library. A file opened from outside has no frontmatter and is not in the index.
- The palette and tab shortcuts do not reach the capture window. `esc`, `⌘⏎`, `⌘F` and the editor's own keys do.

## Development

You need:

- Node, which `.nvmrc` pins to v24.19.0
- [pnpm](https://pnpm.io), whose version corepack reads out of `package.json`
- a [Rust toolchain](https://www.rust-lang.org/tools/install)

Then:

```bash
corepack enable
pnpm install
pnpm dev
```

On first launch notras creates `~/notras` and builds the index. Change the folder in settings (`⌘,`).

| Script                | Description                                       |
| --------------------- | ------------------------------------------------- |
| `pnpm dev`            | run the desktop app (`tauri dev`)                 |
| `pnpm build`          | build the desktop bundle                          |
| `pnpm dev:web`        | run only the web shell (Vite)                     |
| `pnpm build:web`      | build only the web shell                          |
| `pnpm bindings`       | regenerate the Rust command and event client      |
| `pnpm bindings:check` | fail if a temporary native binding export differs |
| `pnpm check`          | type-aware lint, type check and format check      |
| `pnpm fix`            | lint and format, auto-fixing                      |
| `pnpm test`           | run tests (Vitest, watches)                       |
| `pnpm coverage`       | tests with coverage                               |
| `pnpm knip`           | unused code/deps, test-only exports               |
| `pnpm icons`          | generate the icon family and README hero          |
| `pnpm clean`          | remove build output                               |
| `pnpm prepare`        | install the git hooks (lefthook)                  |
| `pnpm tauri`          | run the tauri cli directly                        |

To regenerate the icon family and README hero, edit `assets/icon.svg` for the shared vector artwork or `assets/icon-desktop.png` for the large desktop artwork, then run `pnpm icons`. The command needs macOS for `iconutil`, ImageMagick from `brew install imagemagick`, and project dependencies installed with `pnpm install`.

`scripts/icons.sh` derives the small icons, scheme-aware welcome marks and favicons, and monochrome tray from the SVG. It adjusts stroke weights by logical size, including Retina representations. Sizes above 64 logical pixels use the raster master, which includes its tile and lighting; preserve transparency around it. Interface colors and hero text colors come from `src/styles.css`.

Edit the sources rather than the generated files in `src-tauri/icons/`, the marks and icons in `public/`, or `assets/hero.png`.

Rust commands run from the repository root. The workspace holds the `notras-core` engine and the Tauri shell in `src-tauri`. Install the extra tools once:

```bash
cargo install cargo-machete --locked --version 0.9.2
cargo install cargo-llvm-cov --locked --version 0.9.1
```

| Command | Description |
| --- | --- |
| `cargo machete` | unused Rust dependencies |
| `cargo fmt --all -- --check` | Rust formatting check |
| `cargo fmt --all` | format Rust sources |
| `cargo clippy --workspace --locked --all-targets -- -D warnings` | Clippy, with warnings treated as errors |
| `cargo test -p notras-core --locked` | engine tests without Tauri or binding metadata |
| `cargo test --workspace --locked` | engine and shell tests, including doctests |
| `scripts/check-rust-coverage.sh` | tests with Rust coverage reports in `target/coverage/`, without a threshold |

`AGENTS.md` maps the project docs and the rules for changing them.

## License

[MIT](LICENSE)
