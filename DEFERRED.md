# DEFERRED

Work ruled out rather than done. `AGENTS.md` maps the rest of the docs.

An entry needs a reason that survives someone asking for it: blocked on a decision nobody has made, blocked on access nobody has, or scoped into a change that has not started. Cost, effort and size are not reasons, and neither is calling something an edge case, which `AGENTS.md`'s "Deciding what to do" already covers. A bug you have diagnosed gets fixed instead of an entry, and a defect nobody has scoped gets an issue. An entry leaves this list by being done.

- iA parts-of-speech syntax highlighting and style check (needs real NLP, the wrong weight for this app)
- Content-block transclusion (`/file.md` embeds)
- Backlinks panel (wikilinks are one-directional today)
- Git integration UI (the folder is git-init-able by hand today)
- wdio + tauri-driver e2e (replaces the deleted Playwright smoke tests)
- A verified minimum macOS version for the cask (`tauri.conf.json` sets none, so the bundle carries Tauri's 10.13 default; nothing has tested the real floor, so the cask declares no `depends_on macos:`)
- macOS code signing and notarization (the release workflow already wires the `APPLE_*` variables, so it needs a Developer ID; until then the cask and `README.md` carry the quarantine workaround)
- Code-scanning merge protection for zizmor (it runs with `advanced-security: false`, so a finding fails the job; the Security tab and incremental triage need a ruleset instead, and in that mode the action never fails)
- Whether the release-time gate duplicates a main-push CI run (`ci.yml`'s `push: branches: [main]` arm arrived in #101; at v0.1.2 the file was `on: [pull_request]`, and `gh run list --commit 9a41185` returns only the release workflow, so no CI run has ever covered a tagged commit. If a release merge does fire it, that run and `release.yml`'s `gate` compile the same tree twice, and the in-release copy adds only the dependency edge that stops `verify` publishing. Check after the next release with `gh run list --commit "$(git rev-parse vX.Y.Z^{commit})"`)
- Enforcing the commit format (release-please derives the version and changelog from commit messages, so a hand-typed one silently produces neither; gitzy has no validate subcommand, so this means commitlint, and stet left it as convention too)
- Caching the Linux webkit dep install (measured at 30s on the old four-package list: `apt-get update` 6s, resolve 1s, download 61.5MB 14s, unpack 179 packages 7s, configure 2s. `ci.yml`'s rust job now installs two packages with `--no-install-recommends`, so its share is smaller and unmeasured; `release.yml`'s build job still carries the full list because it bundles. The apt-cache actions restore installed files over a base image that updates weekly, so a cached `libwebkit2gtk` can end up built against a different `libsoup` than the image now ships, and the failure reads as a link error in our code. The deterministic alternative is a prebuilt container image, which reshapes checkout, node and cargo in every job that uses it)
- Splitting the macOS universal build into per-arch legs (rejected on measurement, not on principle: the second arch is 166s of the 412s `Build Bundles` step, but macOS finishes at 498s against ubuntu's 495s, so removing it just makes ubuntu the critical path for a ~3s net gain. It would also give `.github/homebrew/notras.rb.tmpl` two DMGs to choose between, and its `select(endswith(".dmg")) | head -n1` would silently ship one arch to both)
- Narrowing `bundle.targets` from `"all"` (the AppImage is 107s of the ubuntu leg, 22% of it, and 84MB of the 130MB release. The rpm costs 4s and nothing reads it: `verify` greps for dmg, AppImage, deb and exe/msi, and the cask reads only the DMG. Dropping the AppImage is the user-facing half, since `README.md` points people at it and `latest.json`'s `linux-x86_64` entry is signed against it)
- A `.icon` package for system-drawn Liquid Glass (`D34` deferred it rather than closing it)
- MCP server (only if agents ever need richer operations than file writes, such as search as a tool)
- A floating-promise check (`D42` left fire-and-forget calls unmarked and unchecked)
- Enforcement for the `D14` layer boundaries and the lucide icon rule (`D43`)
- Opening an attachment link. A ⌘-click hands `openUrl` a destination relative to the notes dir (`editor.tsx:159`), which the system opener cannot resolve, so a linked PDF goes nowhere while an image beside it renders through `resolveImageSrc`. Opening one needs `opener:allow-open-path`, which `opener:default` does not carry, plus a scope naming which paths the app may hand to the system. Deferred on that scope, not on the wiring
- A focus-visible affordance for `.link-editor-input` and `.code-block-language`, which set `outline: none` and replace nothing
- A message on `DatabaseError` (`src/core/errors.ts`), which carries only `cause`, so a database failure reaches the toast as Effect's own text
- A shortcut or palette entry for typewriter scrolling, the one action reachable from the status strip alone
- A shortcut or palette entry for close others, close to the right, and copy path, the tab actions reachable from the context menu alone (`DESIGN.md`'s keyboard-first rule counts a mouse-only feature as unfinished)
- Something on screen for a tab whose first read failed for a reason other than the file being gone (`D55` keeps the tab rather than closing it, so the panel renders nothing until a later read lands and the toast is the only signal)
- Splitting the window into two tab groups side by side (`D53` keeps one active tab, so a split is a second workspace rather than a second pane)
- A tab's tooltip carrying the full path, which an external tab's truncated basename most wants (`D51`'s glyph rules cover the chrome, not a text label)
- Relative image paths inside an external tab, which `note-session.tsx` leaves unresolved by gating `resolveImageSrc` to a note. The retired `/external` view did the same. Fixing it means asset-protocol scope over whatever directory the file came from, and `tauri.conf.json` ships `"scope": []` with `lib.rs` granting `allow_directory` for the notes dir alone, so it is a security decision rather than a wiring one
- ⌘⇧[ and ⌘⇧] for previous and next tab. Holding shift turns `event.key` for `[` into `{` on a US layout, so the binding would follow the keyboard rather than the chord; ⌘⌥←/→ carries it instead and is in `README.md`'s table
