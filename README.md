<p align="center">
  <img src="assets/hero.png" alt="notras: write another note" width="640">
</p>

<p align="center">
  A keyboard-driven notes app. Your notes are markdown files in a folder you own.
</p>

## Features

- **Portable**: plain `.md` in a folder you pick, written as GFM, so any editor opens it, and markdown you did not edit is saved as you wrote it. Attachments are files, frontmatter keys notras does not use stay as written, and the filename follows the heading. On macOS a note exports to PDF.
- **Safe beside agents**: Claude Code or a script can write to the folder. An open note picks up the change within a second, and edits to the same lines wait for your review.
- **Keyboard friendly**: `⌘P` finds a note, `⌘⇧P` runs any action and shows any shortcut it has.
- **Capture from anywhere**: `⌘⇧N` opens a jot window over any app, and `esc` saves it.
- **Made for code**: code copied from VS Code, Cursor or Zed pastes as code, and highlighting works offline.
- **Diagrams as text**: a `mermaid` block draws as you type and folds its code away when you leave it. The PDF export prints the drawing.
- **Tabs like a browser**: undo per tab, `⌘⇧T` reopens a closed one, `⌘1` to `⌘9` jump, and the open set comes back on relaunch.
- **A graph you navigate**: `⌘⌥G` puts the note in the middle, with mentions on the left, links on the right, and its folder and tags on top. `←` and `→` walk it, and `⏎` opens the note you land on and re-centres there.
- **Tags in the file**: a frontmatter `tags:` list rather than a database. `⌘⇧Y` edits them, `#tag` filters search, the sidebar lists them, and the graph shows every note that carries one.
- **Links you can query**: `[[wikilinks]]` with autocomplete, a count of the notes that mention this one, and search filters for tags, folders, links and mentions.
- **WYSIWYG markdown**: `⌘E` for the source, a `/` menu, blocks you drag or move with `⌥↑` and `⌥↓`, and autosave.

## Install

```bash
brew install --cask jimmy-guzman/tap/notras
```

Or grab an installer from [releases](https://github.com/jimmy-guzman/notras/releases): `.dmg` on macOS, `.AppImage`, `.deb` or `.rpm` on Linux, `.msi` or `.exe` on Windows.

notras needs macOS 26 or later, and the build is universal. On Linux it supports the Ubuntu release behind GitHub Actions' `ubuntu-latest` runner, with current updates. Older Ubuntu releases and other distributions are unsupported.

Builds are not signed with an Apple Developer ID yet ([#171](https://github.com/jimmy-guzman/notras/issues/171)), so macOS quarantines the app on first launch. Check the download against the release's `SHA256SUMS.txt` first:

```bash
shasum -a 256 -c SHA256SUMS.txt --ignore-missing   # macOS
sha256sum -c SHA256SUMS.txt --ignore-missing       # Linux
```

`--ignore-missing` skips the platforms you did not download. It is not a signature, since the sums sit on the same release as the files.

Then clear the flag, which skips Gatekeeper for this app:

```bash
xattr -dr com.apple.quarantine /Applications/notras.app
```

## Keyboard shortcuts

<details>
<summary>All shortcuts</summary>

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
| `⌘F`         | find in the current buffer       |
| `⌘G` / `⌘⇧G` | next / previous match            |
| `⌘⌥G`        | toggle graph view                |
| `⌥↑`/`⌥↓`    | move the selected blocks         |
| `⇧⏎`         | line break inside the block      |
| `⌘⌥⇧V`       | paste as plain text              |
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

</details>

## Your folder

- Search runs on a SQLite index built from the files. Delete it and the next launch rebuilds it.
- The app reads the whole folder so attachments render. Share it only with people and jobs you trust.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup and scripts.

## License

[MIT](LICENSE)
