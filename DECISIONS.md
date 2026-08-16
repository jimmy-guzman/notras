# DECISIONS

Decisions and their rationale, backfilled from the rewrite recorded in
`SPEC.md`.

Numbering is monotonic and IDs are never reused, even after an entry is removed.
A citation in a commit or a comment outlives the line it points at, so reusing
an ID repoints every reference to it without any of them changing.

An entry belongs here when picking one option ruled out another for a reason
worth recording. A rule that must hold, with no competing option anyone would
weigh, is an invariant and lives in `ARCHITECTURE.md`.

## Decisions

### D1 Tauri 2 desktop shell

notras runs as a desktop app: a Tauri 2 Rust shell around a Vite plus React 19
SPA on TanStack Router, with no SSR.

The app is single-user and local-first. A web framework was paying for a server,
a Docker image, and a request lifecycle that a single person editing their own
files never used.

Tauri gives the two things the rest of the design needs: a Rust side that can
own file IO and the index, and a webview thin enough that the editor stays the
whole window.

**Rejected: staying on Next.js 16 in Docker.** Working, and already built.
Rejected because it cannot reach the filesystem the user owns, which `D2`
depends on, and because the framing had failed on its own terms: shipping a
notes app as a container is asking the user to run infrastructure to write a
paragraph.

**Rejected: Electron.** More mature tooling and a larger ecosystem. Rejected on
bundle size and because the parts that matter here, a file watcher and a SQLite
index, are work Rust does well and Node does adequately.

### D2 Notes are files

Every note is a `.md` file under a folder the user owns, default `~/notras`.
Folders are directories, `pinned` and `tags` are YAML frontmatter, attachments
are plain files in `attachments/`.

The decision came from studying
[erictli/scratch](https://github.com/erictli/scratch), and it is what makes the
AI story cost nothing to build. Claude Code or any other agent writes markdown
into the folder, the watcher picks it up, the app refreshes. The filesystem is
the API, so there is no MCP server, no endpoints, and nothing to run.

It also settles three features by removing them: backup is `cp -r`, export is
the folder, and sync is whatever the user already points at the directory.

**Rejected: SQLite as the source of truth.** Faster queries with no
reconciliation problem, and it is what the app already did. Rejected because it
makes every external writer an import problem, which is the opposite of the
property `D2` is buying.

**Constraint:** the filename is the title, which `D5` follows from.

### D3 The index is derived and disposable

The SQLite FTS5 index at `.notras/index.db` holds a mirror of the files for
search and listing. It is rebuilt from the files whenever it is missing.

`ensure_schema` runs CREATE IF NOT EXISTS plus FTS5 on startup, so deleting the
file is a supported recovery path rather than data loss. Step 12 of the manual
walkthrough in `SPEC.md` exercises exactly that.

**Rejected: drizzle-kit migrations.** Standard, and already configured before
the rewrite. Rejected because a derived cache does not need schema history: the
recovery for any drift is to delete the file. Dropping it removed drizzle-kit,
`@libsql/client`, `drizzle.config.ts`, and the `db:push` step.

### D4 Rust is the single writer

Every mutation goes through a Rust command that writes the `.md` file and
updates the index in the same call, then emits `notes-changed`. TypeScript reads
the index through Drizzle's `sqlite-proxy` over a `db_select` command and writes
nothing.

One writer removes the transaction-serialization problem the SQLite-first design
had. It also means the index cannot disagree with the file it describes, because
the same call produced both.

`db_select` is gated on SQLite's own `sqlite3_stmt_readonly`. The first
implementation tested the statement prefix for SELECT or WITH, and a code review
found that a writable `WITH ... DELETE` CTE passes that test.

**Rejected: writes from TypeScript through Drizzle.** Fewer hops and no IPC
round trip. Rejected because two writers to one SQLite file need coordination
the single-writer rule gets for free.

### D5 Note identity is the relative path

The filename is the title. There is no title field in note content, and no
stable ID beside the path. Renaming a note renames the file, which the index
records as a delete plus a create.

Deriving a title from the first heading is a web-era pattern that `D2` removes
the need for: the file already has a name, and the user sees it in Finder.

**Constraint:** creating a note whose title collides dedupes on write, producing
`untitled-2.md`.

**Constraint:** a rename can dangle a wikilink, because `D12` resolves links by
title. Accepted, and scratch accepts the same.

**Rejected: a stable note ID in frontmatter.** Fixes both constraints above.
Rejected because it puts machine bookkeeping into a file the user reads and
another tool may rewrite, which weakens the plain-file promise in `D2` for a
problem a single user hits rarely.

### D6 Two hand-rolled frontmatter parsers

`src/core/frontmatter.ts` and `src-tauri/src/frontmatter.rs` implement the same
dialect independently: `pinned: bool`, `tags` as an inline or block list, and
nothing else.

The Rust side needs it for indexing, the TypeScript side needs it for editing
pins and tags. The dialect is two fields, so two parsers cost less than a shared
serialization boundary would.

**Constraint:** the two must stay in parity, and a change to one is a change to
both, with tests on both sides. The risk is drift, and the mitigation is that
the format is small enough to enumerate.

**Constraint:** the TypeScript serializer preserves unknown keys verbatim. An
externally authored note carrying keys notras does not model must survive a
round-trip through the editor.

**Rejected: a YAML library on both sides.** Correct for arbitrary YAML.
Rejected because it accepts a much larger surface than the app writes, and
because full YAML round-tripping with comment and ordering preservation is
harder than the two-field parser it would replace.

### D7 TipTap 3 for the editor

The editor is TipTap 3 WYSIWYG over the official `@tiptap/markdown`, which
round-trips GFM in both directions. ⌘P shows the raw file in a single
lowlight-highlighted code block.

A CodeMirror 6 live-preview editor was built first and replaced. Research had
ruled out the existing CM6 live-markdown extensions as dead or alpha, so the
mark-hiding, block decorations, and widgets were hand-rolled: bullets, clickable
checkboxes, code cards with hidden fences, rules, inline images, rendered
tables. `@tiptap/markdown` shipping an official bidirectional serializer is what
made a real WYSIWYG document viable, which is the thing the CM6 work was
approximating.

This supersedes the risk `SPEC.md` carried about CM6 live styling being the
largest new UI effort. The effort was real and the answer was to stop paying it.

**Rejected: CodeMirror 6 live preview.** Built, working, and it kept the file
and the buffer identical. Rejected because every rendered construct was a
decoration the app maintained by hand, against a library that gives the same
result as document nodes.

**Rejected: a plain markdown textarea.** Nothing to round-trip and no data-safety
risk at all. Rejected because "just write" means seeing the document, and ⌘P
keeps the textarea available for anything exotic.

**Constraint:** every editor node must define its markdown form and appear in
`markdown-roundtrip.spec.ts`. A node without one drops content from externally
authored files silently.

### D8 The editor holds the body, not the file

Frontmatter is parsed off at load and reattached at save, always from the latest
loader snapshot rather than from the copy the editor started with.

A body save and a pin toggle can race. Composing from the latest snapshot means
the body save cannot clobber a tag or pin the user changed while typing.

**Rejected: frontmatter as an editor node,** which scratch does. Shows the user
everything in the file, in one buffer. Rejected because it puts the racing
values back into the buffer that the race is about.

### D9 Autosave on idle

Saves fire 800ms after the last keystroke, serialize on one chain so overlapping
flushes cannot land out of order, and flush on blur, note switch, unmount, and
quit. Rust holds `ExitRequested` until the webview reports back, and a failed
flush cancels the quit through `cancel_quit`.

`D2` makes a save cheap: writing a file the user owns, not a transaction against
a server.

**Rejected: explicit save.** No lost-write ambiguity and no autosave state to
reason about. Rejected because a notes app that can lose a paragraph to a closed
window is not one people trust, and the tagline is "just write".

**Constraint:** step 14 of the `SPEC.md` walkthrough is manual, because nothing
automated covers the quit handshake.

### D10 Editor-first layout

The window is the editor. There is no persistent sidebar and no navigation
chrome. Launch opens the last-edited note with the editor focused; the empty
state is the wordmark, the tagline, and two key hints.

**Rejected: a sidebar list of notes.** The conventional shape, and it makes the
note count visible. Rejected because a sidebar is permanently on screen to serve
an action taken a few times an hour, which `D11` covers with a keystroke.

### D11 The palette is the action surface

⌘K holds full-text search, `#tag` filtering, recent notes, and every note-level
action: create, pin, move to folder, delete, reveal, settings, reindex.

Concentrating actions in one surface is what lets `D10` remove the chrome. It
also gives every new action a home, so the question "where does this button go"
has one answer.

**Constraint:** a new note-level action belongs in the palette. Adding chrome
for it reopens `D10`.

### D12 Wikilinks resolve by title

`[[note title]]` autocompletes from index titles and renders as a clickable
pill, with a custom tokenizer and node so it survives the markdown round trip.
Resolution is by title, and links are one-directional this pass.

Wikilinks replaced the old links sidebar and its OG preview stack, which pointed
outward at the web. Links between the user's own notes are the feature that
folder-of-files notes actually want.

**Rejected: resolving by path.** Survives renames. Rejected because the user
types a title, and `D5` already accepts the dangling-link consequence.

**Deferred: backlinks.** Recorded in `SPEC.md` rather than here, because nothing
was ruled out.

### D13 Effect 4 service classes

Services are `Context.Service<Self, IShape>()("notras/...")` classes carrying
`static readonly layer`. Errors are `Schema.TaggedError`. A service is reached
through `Service.use((svc) => svc.method(...))`, and `ManagedRuntime` is
executed in exactly one place, `src/data/run.ts`.

The Effect 3 to 4 migration turned 117 type errors into zero, cascading from
nine files. `Tag.pipe(Effect.flatMap(...))` became `Service.use(...)` across all
15 `src/data/` files, which also retired the
`unicorn/no-array-method-this-argument` workaround the old form required.

**Rejected: the Effect 3 `XxxLive` const pattern.** What the codebase had.
Rejected because Effect 4 puts the layer on the class, so the parallel const
became a second name for one thing.

**Constraint:** the RC line is pinned exactly (`4.0.0-rc.x`), since a release
candidate can move under a range.

### D14 Layer boundaries enforced by lint

`src/core/**` may not import `@tauri-apps/*`, React, or `node:*`, and may not
import upward. `src/server/{db,repositories,schemas,services}/**` may not import
`@tauri-apps/*` or React. Two `no-restricted-imports` blocks at the bottom of
`eslint.config.ts` hold both.

The property being protected is that the core and service layers run outside the
Tauri webview, in tests today and in anything else later. Behavior crosses the
boundary through ports: `FileStore` in `src/core`, `Database` in
`src/server/db`.

**Rejected: separate workspace packages.** The compiler would enforce what lint
enforces here. Rejected as too much structure for one app with one consumer of
each layer.

**Constraint:** the blocks stay last in the config, because flat config replaces
rule options rather than merging them. The fix for a violation is never to widen
the glob.

### D15 TipTap's serializer is the canonical form

What lands on disk is whatever `@tiptap/markdown` serializes. oxfmt formats the
repo's own source and never runs on note content.

An earlier design ran a remark-based format pass on blur, which carried a
question about whether remark-stringify and oxfmt would agree. Making the
editor's own serializer canonical removes both the question and the pass, and
took `remark-parse`, `remark-stringify`, `react-markdown`, the preview stack,
and a syntax-highlighting preference with it.

**Rejected: formatting note content on blur.** Produces uniform markdown across
externally authored files. Rejected because it rewrites files the user did not
change in that session, and because moving the caret after a blur is a visible
defect.

**Rejected: Prettier anywhere in the repo.** oxfmt is the formatter.

### D16 A debounced notify watcher reconciles external writes

A `notify` watcher on the notes dir, debounced at roughly 300ms and ignoring
`.notras/`, reindexes changed paths and emits `notes-changed`. The root route
listens and calls `router.invalidate()`.

**Constraint:** the watcher sees the app's own writes too. The mtime skip in
`index_file` makes reindexing idempotent, so self-writes do not echo, and UI
updates come from the awaited command rather than from the event.

**Constraint:** an external edit to the note currently open reloads the buffer
only when the buffer is clean and the file's mtime is newer than the app's last
write. Last-write-wins is acceptable for a single user.

**Rejected: polling the directory.** Simpler and portable. Rejected on latency,
since the property being sold is that an agent's write appears within about a
second.

**Rejected: an MCP server for agents.** The obvious way to let an AI write
notes. Rejected because `D2` already gives agents a write path, and an MCP
server is a process to build, run, and keep in sync with the file format.
Recorded as deferred in `SPEC.md`, in case agents ever need richer operations
than file writes.

### D17 Seven features cut

Each of these removed machinery rather than only a screen.

| Cut                          | What went with it                                                             |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Link extraction, OG previews | og/link services, the `links` table, the only network dependency              |
| Reminders                    | an SSE route, a 30s polling fiber, the notification plugin, reminder presets  |
| Export and import zip        | fflate, export and import services. The folder is the export.                 |
| Image optimization           | sharp and a Rust image pipeline. Attachments are copied as-is.                |
| Profile and greeting         | the user table, user-service, device-user seeding, the profile form           |
| Asset BLOBs                  | blob IPC, `/api/assets`, uploader and preview components                      |
| Cache invalidation           | the `CacheInvalidator` port and `forkBackground`, which had no consumers left |

Mutations now await and then call `router.invalidate()`, which is what made the
last row possible.

### D18 Lowercase user-facing text

Every label, button, toast, tooltip, placeholder, menu item, and empty state is
lowercase, including the wordmark.

**Rejected: sentence case.** The convention, and easier to keep consistent by
accident. Rejected because the lowercase reading is the app's voice, and it is
enforceable by review since it applies everywhere with no exceptions to
remember.

### D19 Shadcn radix-maia on a stone base

UI primitives come from `pnpm dlx shadcn@latest add`, in the radix-maia style on
the stone base color, with tokens as oklch CSS variables and dark as the `:root`
default.

**Constraint:** files in `src/components/ui/**` are generated and not
hand-edited. Non-autofixable lint is handled through the
`**/components/ui/**` override block.

**Constraint:** two deviations are documented, and both are re-applied whenever
the components are regenerated.

1. `command.tsx` moves the sr-only `DialogHeader` inside `DialogContent`,
   because the content is portalled and upstream's placement leaves
   `aria-labelledby` pointing at a node outside the dialog.
2. Generated user-facing strings are lowercased to satisfy `D18`: the sr-only
   and footer "close" labels in `dialog.tsx`, and the default `title` and
   `description` in `command.tsx`.

**Superseded in part by `D22`,** which moves the style to base-maia on Base UI,
and by `D23`, which replaces the stone base and the oklch tokens with the stet
palette in hex. The dark `:root` default and both constraints above carry over
unchanged.

### D20 Quick capture is a second window

The global shortcut opens a small always-on-top window running a bare editor.
Esc saves to `inbox/<timestamp>.md` and hides it.

**Rejected: a modal in the main window.** One window to manage and no second
webview to boot. Rejected because capture has to work when notras is not the
focused app, which is the whole feature.

### D21 No end-to-end tests this pass

The Playwright smoke tests were deleted rather than ported.

Playwright cannot drive a Tauri window. The replacement, wdio plus
tauri-driver, is recorded as deferred in `SPEC.md`.

**Constraint:** the 14-step manual walkthrough in `SPEC.md` is the only coverage
for window behavior, the asset protocol, and the quit handshake. It is run
before anything touching Rust or window behavior merges.

### D22 Base UI under the shadcn base-maia style

The generated primitives move from the radix-maia style to base-maia, which is
the same Maia look on `@base-ui/react` instead of `radix-ui`. The `D19` palette
and both of its constraints carry over.

`radix-ui` is one package that installs 57. Base UI is one tree-shakable
package, and shadcn made it the default in July 2026, so base-maia gets the same
updates radix-maia does. The `data-open:` and `data-checked:` Tailwind variants
that the styles depend on ship in `shadcn/tailwind.css` and match both
libraries' attributes, so the swap is a regeneration rather than a restyle.

**Rejected: staying on radix-maia.** Shadcn has not deprecated it and ships
every component for both. Rejected because carrying 57 packages to reach nine
primitives is the cost of a default the project no longer has a reason to hold.

**Constraint:** `asChild` does not exist in Base UI. Composition goes through
the `render` prop, and `useRender` covers the cases that used `Slot.Root`.

**Constraint:** `#root` sets `isolation: isolate` in `src/styles.css`. Base UI
portals popups to the body after the app root, and the stacking context is what
keeps them above page content without a z-index race.

**Constraint:** the palette stays on `cmdk`, which base-maia's `command.tsx`
still wraps. `cmdk` pulls `@radix-ui/react-dialog` transitively, so Radix is
absent from `package.json` and present in the lockfile.

### D23 The stet palette

Every colour in `src/styles.css` comes from stet, whose source of truth is
`packages/tui/src/theme/{dark,light}.ts`, mapped onto the eleven role names
shadcn generates against. `--primary` carries the accent: `#ffa7d9` in dark and
`#c53794` in light.

notras had no accent. `--primary` was near-white in dark and near-black in
light, so the stone base did every job and nothing on screen could be
emphasised without inventing a colour. playa.dev already imports this palette
from the same source, so adopting it puts three projects on one system at no
maintenance cost.

Seven values are playa.dev's lifted variants rather than stet's own, because
stet treats contrast as a comfortable target while `src/styles.spec.ts` makes
WCAG AA a floor. Each was lifted in OKLCH holding chroma and hue.

**Rejected: authoring a notras palette in the same structure.** The same role
vocabulary and the same restraint, in a hue that is notras' alone. Rejected
because the value of a shared palette is that it is shared, and a fourth hue is
a fourth thing to keep above the contrast floor.

**Rejected: keeping the stone base from `D19`.** Generated, consistent, and
already shipped. Rejected because it has no accent, which is the one thing the
redesign needed.

**Constraint:** hex replaces the oklch-only rule in `D19`.
`color-mix(in oklch, ...)` still interpolates in OKLCH, so the tint recipes are
unaffected.

**Constraint:** shadcn's `--accent` names a hover surface, not the accent. The
accent is `--primary`. Code reaching for `--accent` to emphasise something has
the wrong token.

**Constraint:** a card moves away from the text colour, so it is darker in dark
and lighter in light. Painting the light card at `surface.panel` drops
`--syntax-number` to 3.96:1 against code-block text.

**Constraint:** `@tailwindcss/typography` ships its own stone ramp, which
rendered the note in a warmer grey than the chrome. `.note-preview-prose`
repoints all sixteen `--tw-prose-*` colours at tokens, and
`prose-stone dark:prose-invert` came off the editor. The override sits outside
`@layer`, which is what makes it win.

**Constraint:** `src/styles.spec.ts` fails the build when a text-on-surface pair
drops below 4.5:1 in either scheme, and when the two schemes stop declaring the
same token names.

### D24 Literata on the note surface

The note renders in Literata, a variable serif carrying an `opsz` 7-72 axis,
bundled through `@fontsource-variable/literata`.

notras is read as much as it is written. iA's stated goal for its duospace faces
is that a monospaced-ish font slows reading down to force a more appropriate
writing speed, which serves one half of that at the other's expense. Literata
was drawn from scratch for screen reading, commissioned by Google for Play
Books, and is the open counterpart to Kindle's proprietary Bookerly.

**Rejected: iA Writer Quattro.** What the app shipped, distinctive, and strongly
associated with focused writing. Rejected on the reading half, where its
duospace metrics are a deliberate brake.

**Rejected: New York, the macOS system serif.** Apple's own reading serif,
already on every Mac and reachable through `ui-serif` since Tauri runs WKWebView.
Rejected because the note surface is the one thing that should look the same
everywhere the app runs, and a system face makes it the one thing that does not.

**Constraint:** `font-optical-sizing: auto` on `.note-preview-prose` is what the
`opsz` axis buys, and that Fontsource entry is roughly twice the size of the
`wght` one. Accepted because the fonts ship in the bundle rather than over a
network.

### D25 The system sans for chrome

`--font-sans` is `system-ui`, so the palette, dialogs, and status strip render in
SF Pro on macOS, Segoe UI on Windows, and the system sans on Linux.

notras is a desktop app before it is anything else, and chrome that matches the
OS is chrome the user does not read as a web page. It also removes a bundled
font.

**Rejected: DM Sans Variable.** What the app shipped, rendering identically on
every platform with a warmer geometric character. Rejected because chrome is the
one place where matching the host beats matching itself across hosts.

**Constraint:** the mono is iA Writer Mono everywhere now, inside the editor and
out. `--font-editor-mono` is gone and Geist Mono with it, which is what holds the
face count at three.

### D26 Concentric radii

A surface nested inside another takes the parent's radius less the parent's
padding. `.suggestion-item` and `.link-editor-input` express that as `calc()`
against the parent token rather than as a fixed step on the ladder.

Apple formalised the rule as `ConcentricRectangle` in SwiftUI, and macOS 26
rebuilt its controls to sit concentrically inside window corners. On a
macOS-first app the mismatch reads as carelessness at exactly the sizes the
`--radius` ladder produces.

**Rejected: retuning the ladder so the generated classes land concentrically.**
Would fix the command palette, whose items sit 4px off. Rejected because the
ladder's steps are 4px and 8px apart while the nestings need arbitrary
differences, so a retune that fixes one nesting breaks another, and it would move
`rounded-2xl` for the tooltip at the same time.

**Constraint:** the command palette stays 4px off concentric. Its item radius
lives in `src/components/ui/command.tsx`, which `D19` puts off-limits, and the
ladder cannot express the value. Recorded rather than fixed.

### D27 The launch background is restated outside the stylesheet

`--background` is declared four times: as the token in `src/styles.css`, as a
`color-scheme` meta plus inline critical CSS in `index.html`, as the window's
`backgroundColor` in `src-tauri/tauri.conf.json`, and as two `Color` constants in
`src-tauri/src/lib.rs`.

Both the native window and the webview paint before the stylesheet exists.
WKWebView paints its default canvas, which is white, unless it is told which
schemes the app supports, and the CSS `color-scheme` property cannot say so in
time because honouring it waits on the stylesheet. The meta tag is read before
the document is drawn, which is the whole reason it works.

Tauri's `background_color` covers the window layer, but its own documentation
records "macOS: Not implemented for the webview layer", so on the platform notras
targets first the config option alone leaves the white in place.

**Rejected: `backgroundColor` in the config alone.** One value in one place, and
no duplication to keep honest. Rejected because it does not reach the webview
layer on macOS, which is the layer painting the white a user actually sees.

**Rejected: creating both windows hidden and showing them once the frontend
reports ready.** Removes the flash outright and restates no colour anywhere.
Rejected because it trades a flash for a delay: nothing would appear until React
mounted and four IPC round trips resolved, and a window that takes a beat to show
up reads as a slow app rather than a polished one.

**Constraint:** four copies of one value. `src/styles.spec.ts` fails when any
copy stops matching its token, which is what makes keeping them safe.

**Constraint:** the config value cannot vary by scheme, so it holds the dark one
and `setup()` corrects it from `window.theme()`. A light-mode launch therefore
has a frame where the window layer is dark before the correction lands. Moving
the `main` window out of the config and building it in Rust would remove that
frame, and is the fix if it ever proves visible.

### D28 The titlebar carries the note's identity

The note title, its tags, and the pin toggle live in the window's drag region.
`Titlebar` in `src/components/titlebar.tsx` declares that region once, and every
route and both windows render it.

**Superseded in part by `D30`,** which moves the tags to the status strip. The
title and the pin stay, and every other part of this entry carries over.

The app was spending two bands on one band's work: an empty 36px drag strip, and
a 40px header directly beneath it. Folding one into the other returns 32px to the
note and puts the title where macOS puts a document title, which `D5` already
agrees with, since the filename is the title.

The bar is `h-11`, 44px, with the traffic lights centred in it by `D29`. Content
centres normally, so the title lands on the buttons' line and the space above and
below them is equal. The status strip is `h-7`, since nothing forces its height,
and both carry a hairline border so they frame the note.

The drag region moved out of `__root.tsx` for this. A shared root strip cannot
hold per-route content, and TanStack Router has no named outlet, so each route
renders its own titlebar instead of the root rendering one for everybody.

**Rejected: keeping the empty strip and shrinking it.** Simplest possible change,
and it touches no layout. Rejected because the strip is unavoidable on macOS, so
shrinking it converts wasted space into slightly less wasted space, while the
header band goes on costing its full height.

**Rejected: moving the status strip up as well.** Frees another 32px and leaves a
single band. Rejected because the title, the word count, and three toggles do not
fit beside the traffic lights at the 480px minimum width, and because save state
belongs near where the eye rests rather than in the window chrome.

**Constraint:** `--spacing-titlebar` insets content past the traffic lights, which
macOS floats over the content at the top left. It is a macOS number. Windows and
Linux put the controls on the right and would need it mirrored.

**Constraint:** the title is an editable input inside a drag region, which is new
in this codebase. `styles.css` exempts `button` and `input` from dragging, and any
other interactive element added there needs that rule widened.

### D29 Compact window controls

`use_compact_window_controls` sets `prefersCompactControlSizeMetrics` on each
window's `contentView` and on its three standard window buttons, guarded by
`objc2::available!(macos = 26.0)`.

macOS 26 raised standard control metrics, so a window built against its SDK gets
16x16 buttons where every app built earlier has 12x14. notras builds against SDK
26.5, so its buttons were visibly larger than those of apps beside it.

It is set in two places because the documented behaviour covers "NSControls in
the view or its descendants", and the buttons are not descendants of
`contentView`: they belong to the window's frame view. Setting both costs four
lines and does not rest on which mechanism carries it.

**Rejected: building against SDK 15.x.** One `xcode-select` away, fixes every
control at once, and is what the community writeup recommends first. Rejected
because it pins the whole toolchain to an old Xcode to change one visual detail,
and it would have to be reproduced on any machine or CI runner that builds
notras.

**Constraint:** nothing else in notras is an `NSControl`, since the interface is
HTML in a webview, so this cannot resize anything unintended. That stops being
true if native menus or panels are ever added.

**Constraint:** `trafficLightPosition` is `{ x: 16, y: 24 }`, paired with the
44px band in `src/components/titlebar.tsx`. Both come from
[erictli/scratch](https://github.com/erictli/scratch), which ships them against
the same overlay titlebar, rather than from derivation here.

`y` is not a margin above the buttons. tao's `inset_traffic_lights` resizes the
titlebar container to `buttonHeight + y`, anchors it to the window top, and
leaves each button's offset inside it untouched, so in AppKit's bottom-up
coordinates `y` lands as the button's **centre offset from the window top**.
Misreading that cost four rounds: 12 in a 36px bar centred the buttons at 12pt
against content at 18pt and crowded them into the rounded corner, and removing
the override entirely traded the misalignment for a bar too tight to breathe.

**Constraint:** the height and the offset are one decision. Changing the band
means rechecking the offset, and both sites carry a comment saying so. They are
deliberately not covered by a test: they are a verified pair rather than a
repeated value, so the only honest assertion would either encode a derivation or
pin two literals.

### D30 Tags are picked, not typed

The tag editor is a `Combobox` generated from the shadcn `base-maia` registry,
it reads its vocabulary from `NoteService.listTags()`, and it lives in the
status strip rather than the titlebar. The palette's `#` token filters through
`NoteFilters.tag` instead of scanning the loaded notes in JavaScript.

Both halves of the old tag UX were hand-rolled over capabilities that already
existed. `listTags()` returns every tag with its count, grouped and sorted by
the index, and `getTagFilter()` matches a tag exactly and ANDs with the FTS
filter. Neither had a caller. The editor was a 64px input with no suggestions,
so a typo forked `standup` from `standups` with nothing to surface it, and the
palette recomputed the vocabulary from `notes.flatMap` on every keystroke and
substring-matched it, which disagreed with the index it was standing in for.

The combobox costs one registry entry. `input-group.tsx` already carried
`in-data-[slot=combobox-content]` hooks for it, and its two registry
dependencies were both installed, so adding it regenerated `button`, `input`,
`textarea`, and `input-group` byte-identically once `lint:fix` and `format:fix`
had run.

Tags moved down because the titlebar could not hold them. `D28` put title, tags,
and pin in a 44px band, where the chip row and the title input compete for the
same line and the input was pinned at `w-16` to keep the title readable. The
status strip is where the note's other metadata already sits.

**Rejected: keeping tags in the titlebar with the combobox inline.** Smallest
diff, and it leaves `D28` whole. Rejected because it keeps the space war that
produced `w-16`, and because `D28`'s own constraint requires widening the
`button, input` no-drag rule for any other interactive element in the drag
region. Moving the tags out satisfies that constraint by deletion.

**Rejected: hand-writing the chips input against Base UI directly.** Base UI
ships `Combobox.Chips`, `Combobox.ChipRemove`, and the rest, so the primitives
were reachable without the registry. Rejected because the generated file is the
one that stays in step with `D22`, and writing it here would put it outside
`components/ui/**` where nothing regenerates it.

**Constraint:** a chip in the strip is a filter button, not a `ComboboxChip`. It
answers "show me this tag" where a picker row answers "does this note carry it",
so it has no remove affordance and removal is unchecking a row. That is what
keeps every element in the 28px strip flat, and it is why `ComboboxChips`,
`ComboboxChip`, and `ComboboxChipsInput` go unused.

**Constraint:** dropping `ComboboxChip` also dropped the marking that said a
chip was a tag, so the chip carries a literal `#` and reads `#groceries`.
Without it the names sit as bare words in a strip of status text. The same
applies to a palette note row, which reads `title · folder · #work #notes`. For
the same reason the picker's trigger is a `TagPlus` icon rather than a `#`: a
`#` glyph at the end of a run of tag names reads as one more tag.

**Constraint:** the chips sit in their own box carrying `min-w-0` **and**
`overflow-hidden`, with the add button outside it. `Button` is `shrink-0`, so a
container that is merely allowed to shrink spills its chips over whatever sits
to the right rather than clipping them; `min-w-0` on its own clips nothing. The
button stays outside that box because it is the action while the chips are the
display, so at the 480px minimum width the tags clip and the picker is the
complete view.

**Constraint:** two call-site overrides sit on the generated popup, because
`D19` puts `components/ui/**` off-limits. `ComboboxContent` carries
`shadow-2xl ring-1` where `DESIGN.md` specifies a `--border` hairline and
`0 8px 24px rgb(0 0 0 / 0.18)`, and `ComboboxTrigger` always appends a chevron,
which reads as a dropdown affordance on what is an action button in a 28px band.
