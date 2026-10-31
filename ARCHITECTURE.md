# Architecture

This document holds ownership and cross-module constraints: what must hold and what cannot happen. Behavior sequences, exact messages, and implementation inventories belong in code and tests. Contributor instructions belong in `AGENTS.md` or `CONTRIBUTING.md`.

## System map

- `crates/notras-core/src/` owns filesystem operations, Markdown interpretation, and the derived SQLite index.
- `src-tauri/src/` owns Tauri integration, native windows, events, and operating-system services.
- `src/core/` owns platform-independent frontend logic.
- `src/data/` owns frontend data operations and query definitions over the generated native client.
- `src/components/` and `src/lib/` own the interface, editing sessions, and window state.

## Layer boundaries

`src/core/` must remain isomorphic. It cannot import Tauri, React, React DOM, Node APIs, or higher frontend layers such as data adapters and components.

The `notras-core` crate must remain window-free. Its `Library` owns library IO and index state. The shell can call library operations but cannot manipulate index internals. A library guard cannot cross an `await`; blocking tasks own their decoded inputs for their lifetime.

UI code may access Tauri for events, dialogs, and window control. Note file IO and indexed reads must cross `src/data/`. Native bindings belong in `src/server/adapters/`.

Rust owns validation of persisted inputs, metadata, filters, and relationship resolution. The native command registry is the source of both the invoke handler and the generated TypeScript client. Their signatures cannot be maintained independently.

Expected native failures must retain their reason across IPC; the UI owns the action named in the error. Unexpected defects must be logged and presented with a generic message. A logging failure cannot prevent the caller from receiving that failure.

React Compiler owns memoization. Compiler diagnostics cannot be suppressed to hide compilation bailouts.

## Document ownership

Markdown files are the source of note content. The index must remain disposable and rebuildable from those files. A library note's identity is its relative path; an editing session's identity must survive a path change.

Each loaded tab owns one document, undo history, and persistence queue. Rich and source editing, rename, pin, and tags must act on that document. Indexed query results cannot acknowledge unsaved edits or replace the live document. Metadata edits must apply to the current document rather than a rendered snapshot.

Saving must carry the content revision it started from. A revision mismatch cannot be acknowledged as a successful save. External observations cannot discard unsaved work, and save completion cannot replace newer typing. Closing and quitting must account for pending writes and report failures.

Every editor node must have a Markdown representation and round-trip coverage. Source preservation cannot retain text that parses to different content. Frontmatter, title, and link interpretation must agree across Rust and TypeScript.

## Filesystem and index integrity

Reads cannot mutate notes. The native layer owns line endings and revisions of disk bytes; frontend documents use line feeds.

Library IO must remain bound to validated directory handles. Replacing a path component cannot redirect an operation outside the library. Explicitly selected external files belong to a separate host-path boundary.

Publication requires staged, synced content. A rename or move to a new destination cannot overwrite an existing file, and failed destination publication cannot remove the source. Post-publication cleanup failure cannot be reported as though publication never happened.

Save guarantees are platform-dependent. On macOS and Linux, supported filesystems permit an exchange and recheck of the displaced file. Windows and filesystems without exchange retain a race between the revision check and replacement. A frontend revision check alone cannot establish atomic conflict detection.

Indexing failure cannot undo a committed file operation or hide its warning. Indexed reads cannot expose a partial scan or an unrecovered dirty index. Direct file reads must remain independent of index health. The shell's library owner coordinates foreground operations, scans, and event publication; the engine owns index state.

Poisoned mutexes cannot expose potentially interrupted state. Blocking-task panics must retain their original payload when propagated; non-panic task failures belong to the command error boundary.

## Test boundaries

React component tests use Testing Library and happy-dom; shared setup owns cleanup and DOM matchers. Frontend integration tests fake IPC while retaining the real adapters, query cache, and editor. DOM tests cannot establish native IME behavior, layout, or selection feel.

Engine tests use real SQLite and temporary note directories without a window dependency. Native IPC tests use the production command registry and Tauri's test runtime. Index failure injection belongs at the database boundary, without giving the shell access to the engine's connection.

Native smoke instrumentation requires the explicit test feature and frontend build mode. Production builds cannot include it. Smoke coverage and manual verification requirements belong in `CONTRIBUTING.md` and `AGENTS.md`.

## Platform compatibility

The macOS deployment floor must agree across `src-tauri/tauri.conf.json`, `.github/homebrew/notras.rb.tmpl`, `vite.config.ts`, and `tsconfig.json`. WKWebView follows the installed operating system, so JavaScript and CSS support must fit that floor.
