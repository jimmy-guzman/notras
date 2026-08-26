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
- [x] 9. Drag an image in → lands in `attachments/`, renders inline in the editor.
      Drag one whose name carries spaces, which every macOS screenshot has
- [x] 10. Edit a note in another editor while it's open (clean) → buffer reloads
- [x] 11. Quick-capture hotkey from another app → jot → esc → file in `inbox/`
- [x] 12. Delete `.notras/index.db`, relaunch → search still works (index rebuilt)
- [x] 13. `pnpm tauri build` → built artifact launches; "Open With" on a random `.md` works
- [x] 14. Type, then quit from the tray and again with ⌘Q → relaunch and the last
      keystrokes are on disk
- [x] 15. Install the first release carrying the updater, cut a second, relaunch
      the installed copy → "version x.y.z is available" toast → type, leave the
      keystrokes unsaved, then install → relaunches into the new version with
      those keystrokes on disk. ⌘K → "check for updates..." reports either way.
      Only the development message is reachable under `pnpm dev`: the check is
      `PROD`-guarded, so the install path needs two real releases.
- [ ] 16. ⌘K a note and press ⌘⏎ → it opens beside the current one; plain ⏎ on
      a third replaces the tab that was showing rather than adding to the strip
- [ ] 17. Type in tab A, ⌘2 to B, ⌘1 back → the keystrokes are on disk, ⌘Z
      undoes them, and the caret and scroll are where they were left
- [ ] 18. Type `# a real title` in the showing tab → its label follows the
      heading; the tab left of it does not move
- [ ] 19. Click each tab in turn, including one that is not next to the active
      one → each shows its note; click a tab's × → the neighbour takes over
      rather than the tab merely being selected
- [ ] 19b. Drag a tab past its neighbour → the strip reorders under the pointer
      and stays put on release; ⌘⌥⇧← moves it back; press a tab and jiggle
      inside its own bounds → it selects and does not reorder
- [ ] 20. ⌘W → the tab to the right takes over; ⌘⇧T → it comes back where it
      was; ⌘W on the last remaining tab leaves the empty state, and the tab
      context menu's close agrees with both
- [ ] 21. "Open With" three `.md` files at once → three tabs, no toast, each
      label mono; edit one → it saves to its own path outside the notes dir
- [ ] 22. Open enough tabs to overflow the strip at 480px → a count appears
      beside `+` and picking from it shows that tab
- [ ] 23. `echo` a change into a background tab's file → that tab reloads
      without being switched to; `rm` a clean background tab's file → its tab
      closes on its own; `rm` one holding unsaved edits → it keeps the buffer
      and says the file is gone
- [ ] 23b. `chmod 000` a background tab's file and touch another note to bump
      the watcher → that tab keeps its text and toasts once rather than saying
      the file is gone, and bumping again does not stack a second toast
- [ ] 23c. `rm` a tab's file while it holds unsaved edits, keep typing, then
      restore the file → the banner clears and the next keystroke reaches disk,
      carrying what was typed while the file was gone rather than the buffer
      from before it went
- [ ] 23d. Type into a note, let the 800ms debounce elapse so the save starts,
      and `rm` its file while that write is in flight → the file stays gone
      rather than reappearing, and the tab keeps the buffer behind the gone
      banner. The window is a few milliseconds on a local disk, so repeat it
      against a slow volume or a file the OS is holding if a run does not land
      inside it
- [ ] 24. Quit with four tabs, relaunch → the same four, the same active one,
      each caret restored
- [ ] 24b. Relaunch onto a `localStorage` "tabs" entry written before tabs had
      ids (no `id` on any tab, carets keyed `note:path`) → the same tabs come
      back, the same one active, each caret restored
- [ ] 25. ⌘K → "rename note..." → the tab moves with the file rather than
      duplicating; right-click a tab → close others leaves one
- [ ] 25b. Type into a note, ⌘K → "rename note...", then ⌘Z → the undo reaches
      the text typed before the rename, and the caret and scroll are where they
      were left; ⌘K → "move to folder..." on the same tab does the same
- [ ] 26. Scroll hard past the bottom and then the top of a note longer than the
      window, and flick the tab strip sideways past the last tab → the note
      settles at its bounds and the titlebar, the tab strip and the status strip
      do not move. ⌘P and the capture window are separate scrollers and get the
      same two passes

## Deferred

- iA parts-of-speech syntax highlighting + style check (needs real NLP, the wrong weight for this app)
- Content-block transclusion (`/file.md` embeds)
- Backlinks panel (wikilinks are one-directional today)
- Git integration UI (the folder is git-init-able by hand today)
- wdio + tauri-driver e2e (replaces the deleted Playwright smoke tests)
- A verified minimum macOS version for the cask (`tauri.conf.json` sets none, so
  the bundle carries Tauri's 10.13 default; nothing has tested the real floor,
  so the cask declares no `depends_on macos:`)
- macOS code signing and notarization (the release workflow already wires the
  `APPLE_*` variables, so it needs a Developer ID; until then the cask and
  `README.md` carry the quarantine workaround)
- Code-scanning merge protection for zizmor (it runs with
  `advanced-security: false`, so a finding fails the job; the Security tab and
  incremental triage need a ruleset instead, and in that mode the action never
  fails)
- Whether the release-time gate duplicates a main-push CI run (`ci.yml`'s
  `push: branches: [main]` arm arrived in #101; at v0.1.2 the file was
  `on: [pull_request]`, and `gh run list --commit 9a41185` returns only the
  release workflow, so no CI run has ever covered a tagged commit. If a release
  merge does fire it, that run and `release.yml`'s `gate` compile the same tree
  twice, and the in-release copy adds only the dependency edge that stops
  `verify` publishing. Check after the next release with
  `gh run list --commit "$(git rev-parse vX.Y.Z^{commit})"`)
- Enforcing the commit format (release-please derives the version and changelog
  from commit messages, so a hand-typed one silently produces neither; gitzy has
  no validate subcommand, so this means commitlint, and stet left it as
  convention too)
- Caching the Linux webkit dep install (measured at 30s on the old four-package
  list: `apt-get update` 6s, resolve 1s, download 61.5MB 14s, unpack 179
  packages 7s, configure 2s. `ci.yml`'s rust job now installs two packages with
  `--no-install-recommends`, so its share is smaller and unmeasured;
  `release.yml`'s build job still carries the full list because it bundles. The
  apt-cache actions restore installed files over a base image that updates
  weekly, so a cached `libwebkit2gtk` can end up built against a different
  `libsoup` than the image now ships, and the failure reads as a link error in
  our code. The deterministic alternative is a prebuilt container image, which
  reshapes checkout, node and cargo in every job that uses it)
- Splitting the macOS universal build into per-arch legs (rejected on
  measurement, not on principle: the second arch is 166s of the 412s
  `Build Bundles` step, but macOS finishes at 498s against ubuntu's 495s, so
  removing it just makes ubuntu the critical path for a ~3s net gain. It would
  also give `.github/homebrew/notras.rb.tmpl` two DMGs to choose between, and
  its `select(endswith(".dmg")) | head -n1` would silently ship one arch to
  both)
- Narrowing `bundle.targets` from `"all"` (the AppImage is 107s of the ubuntu
  leg, 22% of it, and 84MB of the 130MB release. The rpm costs 4s and nothing
  reads it: `verify` greps for dmg, AppImage, deb and exe/msi, the cask reads
  only the DMG, and `README.md` names everything but the rpm. Dropping the
  AppImage is the user-facing half, since `README.md` points people at it and
  `latest.json`'s `linux-x86_64` entry is signed against it)
- A `.icon` package for system-drawn Liquid Glass (`D34` deferred it rather than
  closing it)
- MCP server (only if agents ever need richer ops than file writes, such as search-as-a-tool)
- A floating-promise check (`D42` left fire-and-forget calls unmarked and unchecked)
- Enforcement for the `D14` layer boundaries and the lucide icon rule (`D43`)
- Opening an attachment link. A ⌘-click hands `openUrl` a destination relative
  to the notes dir (`editor.tsx:159`), which the system opener cannot resolve,
  so a linked PDF goes nowhere while an image beside it renders through
  `resolveImageSrc`. Opening one needs `opener:allow-open-path`, which
  `opener:default` does not carry, plus a scope naming which paths the app may
  hand to the system. Deferred on that scope, not on the wiring
- A focus-visible affordance for `.link-editor-input` and `.code-block-language`,
  which set `outline: none` and replace nothing
- A message on `DatabaseError` (`src/core/errors.ts`), which carries only
  `cause`, so a database failure reaches the toast as Effect's own text
- A shortcut or palette entry for typewriter scrolling, the one action reachable
  from the status strip alone
- A shortcut or palette entry for close others, close to the right, and copy
  path, the tab actions reachable from the context menu alone (`DESIGN.md`'s
  keyboard-first rule counts a mouse-only feature as unfinished)
- Something on screen for a tab whose first read failed for a reason other than
  the file being gone (`D55` keeps the tab rather than closing it, so the panel
  renders nothing until a later read lands and the toast is the only signal)
- Splitting the window into two tab groups side by side (`D53` keeps one active
  tab, so a split is a second workspace rather than a second pane)
- A tab's tooltip carrying the full path, which an external tab's truncated
  basename most wants (`D51`'s glyph rules cover the chrome, not a text label)
- Relative image paths inside an external tab, which `note-session.tsx` leaves
  unresolved by gating `resolveImageSrc` to a note. The retired `/external`
  view did the same. Fixing it means asset-protocol scope over whatever
  directory the file came from, and `tauri.conf.json` ships `"scope": []` with
  `lib.rs` granting `allow_directory` for the notes dir alone, so it is a
  security decision rather than a wiring one
- ⌘⇧[ and ⌘⇧] for previous and next tab. Holding shift makes `event.key` for
  `[` into `{` on a US layout, so the binding would follow the keyboard rather
  than the chord; ⌘⌥←/→ carries it instead and is in `README.md`'s table
