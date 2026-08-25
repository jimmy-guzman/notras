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
- [ ] 15. Install the first release carrying the updater, cut a second, relaunch
      the installed copy → "version x.y.z is available" toast → type, leave the
      keystrokes unsaved, then install → relaunches into the new version with
      those keystrokes on disk. ⌘K → "check for updates..." reports either way.
      Only the development message is reachable under `pnpm dev`: the check is
      `PROD`-guarded, so the install path needs two real releases.

## Deferred

- Typeset's nested step misses a code block in any list item. The React node
  view wraps a fence in `.code-block-wrapper`, so `li > pre` matches nothing and
  a fence takes the top-level gap under a bullet and under a task alike. It
  reads the same under both, which is why closing the gap for lists and
  blockquotes left it
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
- A focus-visible affordance for `.link-editor-input` and `.code-block-language`,
  which set `outline: none` and replace nothing
- A message on `DatabaseError` (`src/core/errors.ts`), which carries only
  `cause`, so a database failure reaches `toast.error` as Effect's own text
- A shortcut or palette entry for typewriter scrolling, the one action reachable
  from the status strip alone
