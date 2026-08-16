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

**Constraint:** one deviation is documented. `command.tsx` moves the sr-only
`DialogHeader` inside `DialogContent`, because Radix portals the content and
upstream's placement leaves `aria-labelledby` pointing at a node outside the
dialog. Re-apply it if the component is ever re-added.

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
