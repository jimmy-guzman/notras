# Architecture

notras stores notes as Markdown files in a directory the user owns. Rust owns filesystem operations and the derived SQLite index. The React webview owns editing sessions and calls native operations through generated bindings. The index can be rebuilt from files; it is not a second source of note content.

This document describes ownership and constraints that cross modules. Implementation and tests establish current behavior. Investigate disagreements between them and this document before changing either.

## System map

- `crates/notras-core/src/` contains the window-free library engine, Markdown interpretation, filesystem operations, and index.
- `src-tauri/src/` integrates the engine with Tauri, native windows, events, and operating-system services.
- `src/core/` contains platform-independent frontend logic.
- `src/data/` provides frontend data operations and query definitions over the generated native client.
- `src/components/` and `src/lib/` contain interface components, editing sessions, and window state.

## Layer boundaries

Review checks these boundaries; no dedicated import-boundary lint rule enforces them.

- **`src/core/**` is isomorphic.** No `@tauri-apps/*`, `react`, `react-dom`, or `node:*`, and no upward imports from `@/server`, `@/lib`, `@/components`, or `@/data`. It runs in the webview and in any other runtime, which is what makes it testable without a window.
- **The `notras-core` crate is window-free.** Its `Library` privately owns the library directory, SQLite connection and index health. The shell calls operations and cannot manipulate index state. `notes.rs` supplies the blocking task and library lock. Library settings and rebuilds use the same typed command boundary through `src/data`. Native bindings live in `src/server/adapters/**`.
- **UI code** (`src/components`, `src/layout.tsx`, `src/lib`) may use `@tauri-apps/*` for UI concerns: events, dialogs, window control. Note file IO and indexed reads go through `src/data`.

### Data access

The UI calls plain async functions in `src/data/`, one concern per file. Queries, mutations, library settings and reindexing call generated operation commands through `nativeCommand`; Rust owns persisted metadata, filters and relationship resolution. `nativeCommand` converts expected native rejections and Tauri argument-decoding strings into `FileError`, a plain `Error` subclass with a `failed` or `not-found` kind and the original cause. The caller supplies the action and displays the reason. Unexpected defects go to the log through `tauri-plugin-log`, and the caller sees "An unexpected error" even if logging fails.

Index reads reach those functions through TanStack Query. `src/data/queries.ts` owns note query keys. A tab's own file is not an index read: `tabOpeningQuery` reads the file and its stored review together, once, keyed by tab id and discarded with the session, so a reopened tab reads afresh. Every later read goes through the session's persistence controller. Open-note actions use the loaded session. The palette and the tag controls read its live snapshot. Every metadata edit, a pin flip or a tag change, is a function of the document's current frontmatter, applied when it runs. The combobox translates its rendered selection event into toggled tags at the control boundary. This preserves intervening edits before a rerender or save completes, including adding and then removing the same tag. One persistence queue saves complete documents and orders folder moves; query results cannot acknowledge an edit.

### Test seam

React tests run through Testing Library in happy-dom. `vitest.setup.ts` registers DOM matchers, the React act environment, and cleanup without enabling Vitest globals. Editor history and persistence tests use the real Tiptap engine. The happy-dom environment does not establish native IME behavior, layout, or selection feel.

One macOS native smoke test runs under a separate Vitest Node configuration, using WebdriverIO's standalone Tauri service and embedded driver. It edits a seeded note through the webview, verifies the actual file, stops the process, and verifies the saved text after a new launch. Each run has a unique app identifier, notes directory and webview data store, which both launches share. The test uses production IPC and persistence without mocks. The embedded driver inserts content through the browser's editing command; the test does not establish physical keyboard behavior.

The `smoke` Cargo feature and frontend build mode enable test instrumentation, so a normal build carries none. Generated configuration grants its permissions only to the smoke build. Its bundled assets and executable live under `target/smoke/`, separate from release output. Normal unit-test discovery and coverage exclude the smoke suite. The required macOS Rust CI job runs it without test retries and retains failure artifacts for seven days. Native interactions beyond this flow still require manual verification.

Query tests use real SQLite and temporary note directories. Recorded fixtures pin graph, mention and filter behavior. Shared resolver fixtures run in Rust and TypeScript, including malformed percent encodings and duplicate titles. React tests fake the IPC boundary while using the real query adapters and cache.

Rust engine tests run independently with `cargo test -p notras-core --locked`. The engine exposes `Library` operations without an `AppHandle` or window dependency. Its optional `bindings` feature adds Specta metadata and is enabled by the shell. Tauri handlers run blocking work through `spawn_blocking` and obtain a library guard inside that task. A guard never crosses an `await`. Blocking tasks own decoded IPC inputs for their lifetime.

State access panics if its mutex is poisoned; it does not expose potentially interrupted state. Blocking-task panics resume unwinding with their original payload. Non-panic task failures remain command errors. Release builds abort on panic.

The IPC tests use Tauri's test runtime with the production command registry, temporary directories and real SQLite. Index failures are injected through a separate database connection; the shell has no access to the engine connection. They send JSON requests through Tauri's argument decoder and check serialized receipts, failures and events. They do not exercise an OS webview, tray or clipboard. Mutation receipts carry the committed path, its content revision, timestamp and warnings, and every direct read carries the revision of the bytes on disk, which for a CRLF file differ from the line-feed text it returns. Path receipts also carry committed content and any remaining source. Data functions convert timestamps to `Date`. Controller tests supply persistence functions, including the `read` port. Mounted session tests exercise the real editor and tab store over the IPC boundary: they answer reads from a fake disk and deliver an external change the way the watcher does, through `refreshTabs`.

## Editing and persistence

Each loaded tab owns one document, undo history, and persistence queue. Rich mode projects the body of the same document that source mode edits in full. Rename, pin, and tag changes enter that document. The tab's opaque identity survives a filename change; a path is not a session identity. A library note is identified by its relative path. A completed rename removes the old indexed path and adds the new one; a source left behind after a cleanup failure remains a separate note. See `src/components/workspace/note-session.tsx` and the document and persistence modules under `src/components/editor/`.

Saving carries the content revision it started from. A differing revision returns the disk version instead of acknowledging local edits. External observations cannot discard unsaved work: the session reconciles them against its base, combining nonoverlapping changes and retaining overlapping changes for review. Save completion cannot replace newer typing. Closing and quitting must account for pending writes and report failures.

Rich editing preserves Markdown spelling where the source still parses to the edited structure. Every editor node needs a Markdown representation and round-trip coverage. A source mapping must not preserve text that parses to different content. Rust and TypeScript interpret frontmatter, titles, and links independently; corresponding behavioral cases must agree across the boundary.

## Filesystem and index integrity

Reads do not mutate notes. The native layer owns line endings and revisions of disk bytes; frontend documents use line feeds. Library operations validate relative paths and bind IO to directory handles so a replaced path component cannot redirect an operation outside the library. Explicitly selected external files use a separate host-path boundary.

Writes stage and sync temporary siblings before publication. Rename and move operations publish new destinations without overwriting existing files. A failed destination publication leaves the source unchanged. Cleanup can fail after publication, leaving both files and reporting a cleanup warning. On macOS and Linux, supported filesystems exchange a save with its destination and recheck the displaced file. Windows and filesystems without exchange retain a race between the revision check and replacement. Preserve these platform limitations when changing publication; do not infer a stronger guarantee from the frontend revision check.

A committed file operation remains committed when indexing fails. Mutation receipts carry warnings, and index reads require recovery before exposing a fresh view. Healthy scans retain a complete pre-scan view rather than exposing partial results. Direct file reads remain independent of index health. The shell's library owner coordinates foreground operations, scans, and event publication; the engine owns index state.

## Native contracts and platform constraints

The native command registry produces the invoke handler and `src/server/adapters/bindings.ts`. Change the registry or Rust export configuration and regenerate with `pnpm bindings`; never edit the generated client. Persisted inputs are validated by Rust. Typed failures carry a reason; the UI supplies the action that failed.

The macOS deployment floor must agree across `src-tauri/tauri.conf.json`, `.github/homebrew/notras.rb.tmpl`, `vite.config.ts`, and `tsconfig.json`. WKWebView follows the installed operating system, so JavaScript and CSS support must fit that floor.

React Compiler owns memoization. Its diagnostics are compilation failures to resolve, not warnings to suppress. Vendor patches and generated assets have maintenance instructions in `CONTRIBUTING.md`.
