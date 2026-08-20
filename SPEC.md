# SPEC

What a person still checks by hand, and what is not built. The rewrite this file
tracked is done, and `git log` holds how it went.

`AGENTS.md` maps the rest of the docs.

## Verification

`AGENTS.md` carries the static gate. Nothing automated covers window behaviour,
the asset protocol, or the quit handshake, which `D21` records, so this
walkthrough is their only coverage. Run it under `pnpm dev`.

- [x] 1. First launch creates `~/notras/` + `.notras/index.db`; empty state shows
- [x] 2. ⌘N → type → autosave badge; the `.md` file exists on disk with the content
- [x] 3. Type `# a real title` at the top → titlebar follows it; the file does not move
- [x] 3b. ⌘K → "rename note..." → the file, the heading and the titlebar all move
      together; a note with no heading gains none and only its file moves
- [x] 4. **The money shot:** `echo "# from claude" > ~/notras/agent-note.md` from a
      terminal (or have Claude Code write one) → note appears in the palette within ~1s,
      titled `from claude` rather than `agent-note`
- [x] 5. ⌘K search a word → FTS hit with highlighted snippet
- [x] 6. Add `tags: [x]` + `pinned: true` via UI → frontmatter in the file updates;
      filter by tag in palette
- [x] 7. `[[` autocompletes another note; the pill navigates from the editor
- [x] 8. `/` shows the slash menu; inserts a task list
- [x] 9. Drag an image in → lands in `attachments/`, renders inline in the editor
- [x] 10. Edit a note in another editor while it's open (clean) → buffer reloads
- [x] 11. Quick-capture hotkey from another app → jot → esc → file in `inbox/`
- [x] 12. Delete `.notras/index.db`, relaunch → search still works (index rebuilt)
- [x] 13. `pnpm tauri build` → built artifact launches; "Open With" on a random `.md` works
- [x] 14. Type, then quit from the tray and again with ⌘Q → relaunch and the last
      keystrokes are on disk

## Deferred

- iA parts-of-speech syntax highlighting + style check (needs real NLP, the wrong weight for this app)
- Content-block transclusion (`/file.md` embeds)
- Backlinks panel (wikilinks are one-directional today)
- Git integration UI (the folder is git-init-able by hand today)
- wdio + tauri-driver e2e (replaces the deleted Playwright smoke tests)
- In-app auto-update (`tauri-plugin-updater`; the release pipeline ships without
  it, and turning it on needs a signing key, two releases to verify, and
  `auto_updates true` restored to the cask so brew stops upgrading it)
- A verified minimum macOS version for the cask (`tauri.conf.json` sets none, so
  the bundle carries Tauri's 10.13 default; nothing has tested the real floor,
  so the cask declares no `depends_on macos:`)
- macOS code signing and notarization (the release workflow already wires the
  `APPLE_*` variables, so it needs a Developer ID; until then the cask and
  `README.md` carry the quarantine workaround)
- Enforcing the commit format (release-please derives the version and changelog
  from commit messages, so a hand-typed one silently produces neither; gitzy has
  no validate subcommand, so this means commitlint, and stet left it as
  convention too)
- A `.icon` package for system-drawn Liquid Glass (`D34` deferred it rather than
  closing it)
- MCP server (only if agents ever need richer ops than file writes, such as search-as-a-tool)
- A floating-promise check (`D42` left fire-and-forget calls unmarked and unchecked)
- Enforcement for the `D14` layer boundaries and the lucide icon rule (`D43`)
- A focus-visible affordance for `.link-editor-input` and `.code-block-language`,
  which set `outline: none` and replace nothing
- A message on `DatabaseError` (`src/core/errors.ts`), which carries only
  `cause`, so a database failure reaches `toast.error` as Effect's own text
- A shortcut or palette entry for typewriter scrolling, the one action reachable
  from the status strip alone
