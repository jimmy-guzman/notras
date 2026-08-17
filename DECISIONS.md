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

**Superseded in part by `D32`,** which resolves the title from frontmatter, then
a leading heading, then the filename. Relative-path identity carries over: the
path is still the primary key, and there is still no stable ID beside it.

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
dialect independently: `pinned: bool`, `tags` as an inline or block list,
`title` as a read-only string since `D32`, and nothing else.

The Rust side needs it for indexing, the TypeScript side needs it for editing
pins and tags. The dialect is two fields, so two parsers cost less than a shared
serialization boundary would.

**Constraint:** the two must stay in parity, and a change to one is a change to
both, with tests on both sides. The risk is drift, and the mitigation is that
the format is small enough to enumerate. `D32` extends the same obligation to
the two title resolvers that read this dialect.

**Constraint:** `title` is parsed and never serialized. It is not one of
`withoutOwnKeys`'s own keys, so it survives a pin or tag toggle as a foreign
line, and `updateFrontmatter` takes a patch type that cannot name it.

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

**Amended by `D32`,** which added a filename-stem fallback and a tie-break of
nearest folder then path order. A resolved title stopped being unique once it
came from content, so resolution needed both a second source and a rule for
duplicates.

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

**Constraint:** three deviations are documented, and each is re-applied whenever
the components are regenerated.

1. `command.tsx` moves the sr-only `DialogHeader` inside `DialogContent`,
   because the content is portalled and upstream's placement leaves
   `aria-labelledby` pointing at a node outside the dialog.
2. Generated user-facing strings are lowercased to satisfy `D18`: the sr-only
   and footer "close" labels in `dialog.tsx`, and the default `title` and
   `description` in `command.tsx`.
3. `toggle.tsx` gains the `xs` and `icon-xs` sizes `button.tsx` already ships,
   copied from it. `D37` records why the app needs a 24px toggle that upstream's
   `h-9` / `h-8` / `h-10` ladder does not reach.

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

**Superseded in part by `D38`,** which brings the save glyph into the bar. The
rejection below says save state belongs near where the eye rests rather than in
the window chrome, and it was written about moving the whole strip up. `D38`
re-examines it for one glyph, which the width argument does not reach.

The app was spending two bands on one band's work: an empty 36px drag strip, and
a 40px header directly beneath it. Folding one into the other returns 32px to the
note and puts the title where macOS puts a document title. `D32` later changed
where that title comes from, which does not affect where it is shown.

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

**Constraint:** `styles.css` exempts `button` and `input` from dragging, and any
other interactive element added to the region needs that rule widened. The title
was such an element until `D32` made it display-only text, so the exemption
covers the pin toggle and the `.no-drag` class `D35` added for elements that are
hoverable without being clickable.

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

### D31 Tags are edited from two surfaces over one implementation

Tag editing is reachable from the status-strip picker (`D30`) and from a `tags`
sub-view in the ⌘K palette. Both route through `useNoteTags` in
`src/components/notes/use-note-tags.ts`, which owns the optimistic list, the
loader sync, and the write.

`D11` says a note-level action belongs in the palette, and tag editing was the
one that did not have an entry there. Three things made the palette the natural
second home rather than a new invention: `PaletteView` was already a sub-view
machine for `move` and `delete`, `CommandItem` already shipped a
`data-[checked=true]` checkmark that nothing used, and pin had been a titlebar
toggle and a palette action since it shipped. So a note-identity control living
in chrome and in ⌘K was established here, not novel.

This entry exists because it reverses a rejection. The same change arrived as a
review finding and was turned down, and the leading argument was that it
contradicted `D28` and `D30`. That is not a reason. These entries record
reasoning so it can be re-examined, and `D28` had been superseded by `D30` in
the same sitting. Judged on the merits instead, the finding was right.

**Rejected: the palette only, dropping the strip picker.** Removes a bespoke
floating surface and its call-site overrides, and returns about 60px to a strip
that is tight at the 480px minimum. Rejected because tagging happens while
writing, and it would leave a note with no tags showing no way to add one
without opening a dialog.

**Rejected: the strip only, as shipped.** One surface, nothing new to build.
Rejected because it left ⌘K unable to do a thing every other note-level action
can, which is the gap `D11` exists to close.

**Constraint:** a surface that edits tags calls `useNoteTags`. Two surfaces over
one implementation is the arrangement this entry permits; two implementations is
what `DESIGN.md` forbids, and a third surface would take the hook too.

**Constraint:** `useNoteTags` serializes its writes. `NoteService.setTags` is a
read-modify-write of the file, and every call site is fire-and-forget, so two
overlapping toggles could land in either order and leave disk holding the older
set. Writes chain, and a failure rolls back only when it is the newest change,
so a superseded request cannot restore a set the user has moved past.

**Constraint:** rows in the tags view call `changeTags` directly rather than
`runAction`, which closes the palette. The view is a working surface, so a
toggle must leave it open. It is the only place in the palette where an action
row does not dismiss.

**Constraint:** the per-tag count in that view is a plain span, not a
`CommandShortcut`. The generated checkmark carries
`group-has-data-[slot=command-shortcut]/command-item:hidden`, so an item holding
a shortcut slot hides the check that says whether the tag is attached.

### D32 The title resolves from frontmatter, then a heading, then the filename

A note's displayed title is its frontmatter `title:`, else its leading `#`
heading, else its filename stem. `resolve_title` in `src-tauri/src/index.rs`
fills the index column, `resolveTitle` in `src/core/notes.ts` serves the open
note, and both read the same three sources in the same order.

**Supersedes the filename-is-title half of `D5`.** Relative-path identity carries
over unchanged: the path is still the primary key, and nothing here introduces a
second identifier.

Two things forced it. The filename constrained the title to what a filesystem
accepts, so `NOTE_SEGMENT_PATTERN` banned `/`, `\`, `:` and a leading dot from
what is otherwise prose. And `SPEC.md`'s own walkthrough writes
`echo "# from claude" > agent-note.md`, producing a note with two titles that
disagree, where the app read the one nobody wrote. Stating a title as a heading
is the convention every other markdown tool follows, so honouring it is `D2`
applied to titles.

`D5` argued the opposite from need rather than portability: the file already has
a name and the user sees it in Finder. Finder is one tool. `D2`'s promise is that
any tool can write into the folder and be understood, and the old rule met that
promise for the one reader that browses filenames.

**notras never introduces a title, and never renames a file on its own.** It
reads all three conventions and imposes none on a file that did not already
carry one. This is what keeps the entry small, and it is the part most likely to
erode.

Resolving a title is not enough on its own, because nothing puts the sources back
in step and so no single act means "retitle this note." A file named `foo.md`
holding `# bar` shows `foo` in Finder and `bar` in the app, renaming it looks
inert, and editing the heading moves nothing on disk. **The ⌘K action closes that
gap:** it takes a title, rewrites an existing leading heading, updates an
existing `title:` key, and renames the file to `filenameFromTitle` of the title.

That sync is deliberately narrow, which is the whole trick. An existing heading
is rewritten and one is never invented, so a note opening with prose, a list, a
quote, or a deeper heading is left byte-identical, and deleting the heading opts a
note out for good. Because it fires only on an explicit rename, it avoids what
made continuous syncing untenable in the rejection below. Updating a key someone
already put in the file is different from adding one, so nothing above changes.

**Rejected: deriving the title from the heading and syncing the filename to it,**
which is what scratch does in `save_note`. Finder and a GitHub file listing would
always match the title. Rejected because it renames on a content edit: a daily
note at `2026-08-16.md` headed `# Sunday, August 16` loses a sortable filename,
quick capture's timestamps are eaten the moment a heading is added, and with git
sync planned every retitle becomes history churn.

**Rejected: a frontmatter `title:` that notras writes.** Unambiguous, and what
Hugo, Astro and Dendron read. Rejected because GitHub renders a frontmatter block
as a malformed table above every file it displays, so authoring one degrades
reading the vault on the destination the sync plan names.

**Rejected: ordering the heading above frontmatter,** which is what ZenNotes does
in `export-title.ts`, reasoning that visible content beats metadata. Kept as the
fallback rather than the winner because frontmatter is the only one of the three
a person sets deliberately as a title, where a heading usually doubles as one.
Notes carrying both are rare, and flipping the order is a one-line change.

**Rejected: leaving the three sources unsynced.** No new writes and no new
decisions, which is where this entry first landed. Rejected because it makes the
⌘K rename look broken on exactly the notes the chain was built for, and leaves
the app with no act that means "retitle."

**Rejected: syncing the heading but not the `title:` key,** which is
[ZenNotes' rule](https://github.com/ZenNotes/zennotes) in `note-heading-sync.ts`
and keeps the never-writes claim whole. Rejected because a note carrying a key
would still ignore a rename, which is the same defect in a smaller place.

**Constraint:** the heading must be the first non-blank line of the body. A
heading further down is a section heading. This is also what lets the extractor
skip fenced code blocks without tracking them, since a fence opener cannot match
the heading pattern.

**Constraint:** a title round-trips only for a note with somewhere to keep one. A
note with neither a heading nor a key falls back to its filename, so retitling
`Effect: A Primer` there displays `effect-a-primer`, the slug, because the
filesystem cannot hold the colon and nothing may be invented to hold it.

**Constraint:** `filenameFromTitle` lowercases and hyphenates, and does not fold
non-ASCII, so `café notes` yields `café-notes.md`. That keeps the exposure to the
macOS NFD versus NFC filename mismatch, which is not a regression, since nothing
stopped that filename before.

**Constraint:** a title is written into a heading verbatim rather than
markdown-escaped, so `my *title*` renders as emphasis and reads back
byte-identical. Escaping would break the round trip unless the read path
unescaped too.

**Constraint:** the two resolvers stay in parity, the same way `D6` binds the two
frontmatter parsers. `src-tauri/src/index.rs` and `src/core/notes.spec.ts` assert
one shared table of cases in the same order so it can be diffed by eye.

**Constraint:** the titlebar title is display-only, so renaming a file is a ⌘K
action. `D28`'s note about an editable input in the drag region no longer applies
to the title.

**Constraint:** a resolved title is not unique. `D12` gains a filename-stem
fallback and a deterministic tie-break, because the filesystem no longer enforces
uniqueness over the thing being displayed.

### D33 The icon is generated from a vector master and a render, split by size

`scripts/icons.sh` builds every file in `src-tauri/icons/` from sources in
`assets/`. Four vector files carry the mark and a 1254px clay render carries the
large sizes. Sizes at 16px come from `icon-tiny.svg`, 17 to 40 from
`icon-small.svg`, 41 to 96 from `icon.svg`, and 97 and up from `icon-render.png`.
`iconutil` assembles the ten representations into `icon.icns`, because
`pnpm tauri icon` takes one source per run and the icns spans 16px to 1024px.

Detail has to drop out as pixels run out. Measured on the render, an eye is 4.1%
of the tile and an accent dot 2.5%, so through Apple's 824-on-1024 grid an eye is
4.2px at 128, 2.1px at 64, and 1.1px at 32, where an accent dot is down to
0.6px. Below 64px the accent renders as colour noise rather than a dot, and at 16px
two eyes 1px wide and 2px apart merge into a bar that reads as a smudge. So
`icon-small.svg` drops the accent and the back blob's eyes and enlarges the
remaining pair, and `icon-tiny.svg` drops every dot and keeps the two-blob
silhouette. The icon is the accented variant at large sizes and close to
monochrome at small ones.

**Rejected: one `tauri icon` pass from a single source.** One command, no script,
and nothing to keep in step. Rejected because a single source cannot vary detail
by size, and the same artwork scaled to 16px is the smudge above.

**Rejected: shipping the render as it arrived.** It is opaque, with a flat
`#0f1013` surround and its tile inset inside a 1254px canvas, so it would put a
dark square in the Dock where a squircle belongs. The script crops to the tile,
masks it to a superellipse, and centres it on Apple's grid instead.

**Rejected: keying the icon's palette to the tokens.** The reference sheet's
swatches are the light palette, and `DESIGN.md` says every colour is a token. The
render is a lit scene, so its tile reads `#1c1e21` against the token's `#2a2e33`
and its accent `#913168` against `#c53794`. Matching the tokens in the vector
files would have made the icon visibly change shade between 64px and 128px inside
one icns, so the vector files match the render instead.

**Rejected: a Node script with a rasterizer dependency.** `tsconfig.json` covers
`**/*.ts` and `eslint.config.ts` ignores only `src-tauri/**`, so it would be
typechecked and linted, and knip's `project` glob does not reach `scripts/`, so
the dependency would read as unused. Bash sidesteps all four gates and matches
`scripts/update-shadcn.sh`.

**Constraint:** generation is macOS-only and needs ImageMagick on the PATH.
`iconutil` ships with macOS and `magick` does not, so the script checks for both
and names `brew install imagemagick`. No CI step runs it.

**Constraint:** the crop constants in `scripts/icons.sh` were measured against
this render. Its tile is 972x972 at (141, 113) in a 1254px canvas, sitting 28px
above centre, with a superellipse exponent near 4.7 solved from four edge
scanlines. A replacement render has to be re-measured, so the script asserts the
source is 1254px square and fails loud when it is not. `D34` takes the shipped
shape to exponent 5.0; the 4.7 here still describes the render and still governs
the crop.

**Constraint:** the tray asset is one 36px square. `tray-icon` hardcodes an 18pt
height and scales by aspect ratio, so a second file would never be read, and the
glyph fills 92% of its frame to sit right in the menu bar.

### D34 The icon's edge follows measured macOS geometry

The tile is a superellipse at exponent 5.0 on Apple's 824-on-1024 grid, carrying a lit
edge ~20px wide and a soft drop shadow offset ~10px down at 13% opacity. Every figure
comes from measuring the platform rather than from a spec: this machine runs macOS 26,
so the ICNS containers of seven system apps were parsed and probed directly.

Those apps agree exactly. All seven put the art at 80.5% of the canvas with a 9.8%
margin and fit an exponent of 5.00. Five of five bake a drop shadow into that margin,
which is what the margin is for, reading 13% alpha two pixels below the shape and 3 to
4% above. The lit edge is not universal, since Notes reads 238 at its boundary and Maps
251, both being light icons; it is shared by the dark-tiled ones, TV and Terminal, which
run 144 at the boundary down to their base over five pixels. Those two are the
precedent a `#1c1e21` tile follows.

**Amends `D33`.** The exponent 4.7 recorded there stays true of the render and is still
what the crop uses; it is no longer the shape notras ships.

**Rejected: keeping the render's 4.7.** It cost nothing and the mask already existed.
Rejected because it is the shape an image model happened to draw, and matching the
platform is the whole reason the icon is a squircle rather than a rounded rectangle. The
gap is 9.4px on an 824px art square, worst near the middle of the straight sides, so
Apple's reads fuller and flatter-sided.

**Rejected: masking the render at 5.0 without redrawing the tile.** One fewer step.
Rejected because 5.0 extends 4.5px beyond 4.7, so the mask reaches past the artwork and
exposes its opaque `#0f1013` surround as a fringe. The render is composited onto a tile
drawn at 5.0 instead, and the rim covers the 4.5px seam with 19px to spare.

**Rejected: a `.icon` package for system-drawn Liquid Glass.** `tauri-bundler` 2.9.4
does support it, matching `.icns`, `.car`, and `.icon` in `bundle.icon`, compiling the
package with `actool` and deriving `CFBundleIconName` from the resulting `Assets.car`.
Rejected because `actool` ships inside Xcode 26 and only the Command Line Tools are
installed here, so the build logs a skip and ships the `.icns` alone. Deferred rather
than closed.

**Constraint:** the tile shape lives twice, as bezier data in `assets/*.svg` and as the
`-fx` mask in `scripts/icons.sh`, and nothing derives one from the other.
`assert_svg_tile_matches_mask` rasterizes `icon-tiny.svg`, whose alpha silhouette is the
tile because its blobs sit wholly inside, and diffs it against the mask at 512px.
Tolerance is 0.005 against 0.0022 of antialiasing. It earned its place on the first run
by catching a 1px inset that would have split the silhouette across sizes.

**Constraint:** the rim and shadow are rebuilt at every output size rather than
downscaled from the master, so a 16px icon gets a sub-pixel edge instead of a blurred
one. The rim uses a distance map, `-morphology Distance Euclidean:1`, whose values are
pixels over 655.35 in this Q16 build, and it must be multiplied by the mask because the
map reads zero outside the shape and would otherwise paint the whole margin.

**Constraint:** generated PNGs are written with `-strip`. ImageMagick embeds `png:tIME`
and `date:` chunks, which left the output pixel-identical but byte-different on every
run, so regenerating dirtied 19 binary files in git for no change.

### D35 The save state is a glyph

`SaveIndicator` renders one lucide save icon per state. This entry decides the
three that existed when it was written: `SavePenIcon` for `dirty`, `SaveIcon` for
`saving`, `SaveCheckIcon` for `saved`. All three share a floppy body and differ
in the badge at its lower-right corner, so the shared shape names the subject and
the badge names the state. The word survives in a hover tooltip and in `sr-only`
text. `D38` adds a fourth state and keeps the rule.

The strip opened on a word that rewrote itself on every keystroke and settled
800ms later, `unsaved` to `saving...` to `saved`. It was the widest item in a row
already carrying chips, a button, a word count and three toggles, and it was the
only one that changed while the user was reading the note above it.

One component covers both surfaces. `src/routes/external.tsx` spelled the same
state a second way, as `external file · saved`, which is the second
implementation `DESIGN.md` calls a bug in the design.

**Rejected: the word.** What shipped until now, and the only version that says
what it means without being hovered. Rejected because a status nobody acts on
does not earn the widest slot in the strip, and because the churn was the
complaint.

**Rejected: a bare dot,** which is what editors use for an unsaved buffer.
Rejected because a dot names no subject. In a strip already carrying tags, a
count and three toggles, it reads as an indicator of something.

**Rejected: showing nothing once saved.** The quietest option, and defensible for
an app that autosaves. Rejected because `D2` ruled out an explicit save on the
grounds that there is no lost-write ambiguity, and that argument assumed the
state stayed on screen to be checked.

**Constraint:** the three glyphs above differ by a badge roughly 4px wide at
`size-3.5`, so the tone carries the rest. `saved` sits on `--faint` and the other
two on `--muted-foreground`. Changing either tone makes the states harder to tell
apart, not just quieter. `D38` moved the indicator out of the status strip and
gave its fourth state a tone of its own.

**Constraint:** the indicator is a status and not a control, so its tooltip
trigger renders a `span`. It takes no tab stop and hover is the only opener,
which is why the `sr-only` text exists rather than an `aria-label` on the svg.

**Constraint:** anything hoverable inside `.titlebar-drag-region` needs
`no-drag`, which `styles.css` now exposes as a class beside its `button` and
`input` selectors. Without it macOS swallows the pointer and the tooltip never
opens, which `D28` records as the rule this widens.

### D36 Every item in the status strip is a shaped item

The strip sets one gap and each item carries its own padding, which comes from
the component it is. The footer is `px-3 gap-1`, each run of like items is
`gap-0.5`, and nothing overrides a variant to reach a number.

The insets follow from the components: the save glyph and the view toggles sit
in a 24px box at 5px, a tag chip is a `Badge` at 8px, `add tag` is a
`Button size="xs"` at 10px, and the word count is text given the badge's `px-2`
so it is shaped like what it sits between. Between-item distances land at 17px
and both window edges at 17px, and the toggle run stays clustered at 12px.

Those distances are an outcome rather than a target. Spacing is stated once, at
the footer, and adding an item to the strip means choosing what the item is, not
re-deriving a sum.

**Rejected: holding equal optical gaps by hand.** The first version of this
entry did, with `px-1` on two chips, a `size-6` box on the glyph, and a wrapper
`div` carrying a third gap. It was exact on the day it was written. Rejected
because a text pill and an icon square have different padding by nature, so
equality between them is a coincidence someone re-establishes after every
change, and nothing in the gate notices when it lapses.

**Rejected: one gap and no shaped items.** Simplest possible rule: give the
footer a gap and leave every child as it was. Rejected because the word count is
bare text with no inset while a chip carries 10px, so the same gap yields
distances 10px apart no matter which gap is chosen. Shaping the items is what
lets one number work.

**Constraint:** the chips are the only part of the strip that shrinks, so
`min-w-0` has to reach `NoteTags` unbroken from the footer. The wrapper `div`
that briefly sat between them is gone, and any future one carries `min-w-0`.

**Constraint:** the gap inside a control is not one of these numbers. The 4px
between the `TagPlus` icon and the words `add tag` is `size="xs"`'s own `gap-1`.

### D37 Chrome toggles come from `Toggle`, at one size and one on-state

Anything in chrome that turns on and off is `Toggle` or `ToggleGroupItem` from
`@base-ui/react`, at `size="icon-xs"`, and shows its on-state as
`--foreground` against the idle `--muted-foreground`.

Two hand-rolled versions preceded it. `StatusToggle` in `status-bar.tsx` wrote
`aria-pressed` by hand, shrank `size="icon"` three steps with a `size-6`
className when `size="icon-xs"` was already `size-6`, and drew its on-state as
`bg-accent text-accent-foreground`. `note-header.tsx` was the same component a
second time, with an on-state of `text-primary`. `DESIGN.md` rules out both
colours: the accent stays out of chrome and `--primary` belongs on the focus
ring.

The three view toggles are one `ToggleGroup`, which is one tab stop with
arrow-key movement inside it rather than three separate stops. They stay three
independent settings: `StatusBar` still takes three booleans and three
handlers, and a descriptor array derives the group's value from them and routes
a change back to the one handler whose membership flipped.

**Rejected: `Marker` for the save indicator.** Named as a candidate, and its
anatomy is the right shape, an `aria-hidden` icon slot beside content. Rejected
on its classes: the root is `flex min-h-4 w-full items-center gap-2 text-sm`,
where the strip needs neither full width nor `text-sm`, its variants are a
`::before`/`::after` hairline separator and a `border-b` row, and `role="status"`
is not built in. Adopting it means overriding `w-full` and `text-sm` to arrive
back at the span already there.

**Rejected: `ButtonGroup` for the toggles.** The other named candidate. Rejected
because its horizontal variant attaches its children, `rounded-r-none` on every
slot and `border-l-0` on each one after the first, which turns a spaced run into
one continuous control. The toggles read as separate at 12px and that reading is
the one being kept.

**Constraint:** the on-state is a `className` at the call site, not a change to
the generated variant. `toggleVariants` ships `aria-pressed:bg-muted` alongside
`hover:bg-muted`, so pressed and hover would be the same surface;
`aria-pressed:bg-transparent aria-pressed:text-foreground` overrides it through
`cn`, whose `twMerge` drops the losing class rather than relying on stylesheet
order.

**Constraint:** the generated `toggle-group.tsx` carries
`data-[state=on]:bg-muted`, a Radix attribute Base UI does not emit. It is dead
and stays dead, since `src/components/ui/**` is not hand-edited beyond `D19`'s
listed deviations. `aria-pressed` is the working hook.

**Constraint:** `toggle-group.tsx` added four rules to the
`**/components/ui/**` override block in `eslint.config.ts`, which `D19` names as
where non-autofixable lint in generated files goes.

### D38 The save glyph sits in the titlebar and can say it failed

`SaveIndicator` renders between the title and the pin, and `SaveStatus` carries
a fourth member, `failed`, drawn as `SaveOffIcon` on `--destructive`.

The app had two answers to where it goes. `notes.$.tsx` put it first in the
status strip and `external.tsx` put it in the titlebar, because that route has
no strip. Both are routes in the `main` window, so the split showed inside one
window. Every route renders a `Titlebar`, including the capture window and the
launch screen, which render an empty one; one route renders a `StatusBar`. The
bar the app has everywhere is the one that can hold this.

That leaves the strip carrying the note's own metadata and the view controls,
with no app state in it, and the titlebar carrying what the note is: its title,
whether it is pinned, whether it is written.

The `failed` member matters more than the placement. `useAutosave` caught a
failed write, restored the buffer and set `dirty`, which is the state a
keystroke produces and is drawn with the same glyph and the same `unsaved`
label. A disk refusing writes and a note typed into half a second ago were
identical on screen. Nothing else covered it: pin toggles, tag edits and even
copying a code block toast on failure, while the note body did not, and the only
save-failure message in the app arrived from the quit handshake when the user
pressed ⌘Q.

**Rejected: the strip's leading slot,** where it shipped. Rejected because it is
the most prominent position in the band, held by the least informative item in
it whenever nothing is wrong, and because it cannot be applied to the external
route without giving that route a status strip it does not otherwise need.

**Rejected: a toast from `useAutosave`,** matching `external.tsx`, which already
does this. Rejected because that write is debounced and retried on every
keystroke, so a disk that keeps refusing stacks a toast per attempt. The route
that toasts does so from a single debounced callback and now sets `failed` as
well.

**Rejected: hiding the glyph once saved,** revisited from `D35`. Rejected again,
and harder now: with `failed` as a real state, a hidden `saved` would make
"nothing on screen" mean both "written" and "this route does not show it".

**Constraint:** `failed` clears on its own rather than being dismissed. A later
keystroke sets `dirty`, and the next flush either lands in `saved` or returns to
`failed`. There is no acknowledge action and no retry timer.

**Constraint:** the tooltip reads `could not save`, a fixed string, while
`run.ts` unwraps a specific message that the `catch` still discards. Carrying the
real one means threading it through `useAutosave`, `NoteHeader` and
`SaveIndicator`, which is its own change.

**Constraint:** the titlebar costs 36px more at the 480px minimum width, leaving
the title 312px. `--spacing-titlebar` takes 84px and `pe-3` takes 12px, and the
pin already took 36px.
