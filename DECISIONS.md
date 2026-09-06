# DECISIONS

Decisions and their rationale. The early entries were backfilled from the rewrite, which `git log` records.

This file is a log, not a set of rules. An entry records what was decided and why, at the time it was decided. A later entry can supersede an earlier one, and the earlier one stays where it is with its reasoning intact, so an entry answers why the code looks the way it does. What must hold today is an invariant in `ARCHITECTURE.md`, what you must do is a rule in `AGENTS.md`, and what the app does is `SPEC.md`.

A **Constraint:** line reads closest to an order and is not one. It names what the decision left the codebase carrying, and it holds only as long as that decision does.

Numbering is monotonic and IDs are never reused, even after an entry is removed. A citation in a commit or a comment outlives the line it points at, so reusing an ID repoints every reference to it without any of them changing. The highest number issued so far is 71, and some entries below it were removed, so the next entry takes 72.

An entry belongs here when picking one option ruled out another for a reason worth recording. A rule that must hold, with no competing option anyone would weigh, is an invariant and lives in `ARCHITECTURE.md`.

## Decisions

### D1 Tauri 2 desktop shell

notras runs as a desktop app: a Tauri 2 Rust shell around a Vite plus React 19 SPA on TanStack Router, with no SSR.

The app is single-user and local-first. A web framework was paying for a server, a Docker image, and a request lifecycle that a single person editing their own files never used.

Tauri gives the two things the rest of the design needs: a Rust side that can own file IO and the index, and a webview thin enough that the editor stays the whole window.

**Rejected: staying on Next.js 16 in Docker.** Working, and already built. Rejected because it cannot reach the filesystem the user owns, which `D2` depends on, and because shipping a notes app as a container asks the user to run infrastructure to write a paragraph.

**Rejected: Electron.** More mature tooling and a larger ecosystem. Rejected on bundle size and because the parts that matter here, a file watcher and a SQLite index, are work Rust does well and Node does adequately.

### D2 Notes are files

Every note is a `.md` or `.markdown` file under a folder the user owns, default `~/notras`. Folders are directories, `pinned` and `tags` are YAML frontmatter, attachments are plain files in `attachments/`.

The decision came from studying [erictli/scratch](https://github.com/erictli/scratch), and it is what makes the AI story cost nothing to build. Claude Code or any other agent writes markdown into the folder, the watcher picks it up, the app refreshes. The filesystem is the API, so there is no MCP server, no endpoints, and nothing to run.

It also settles three features by removing them: backup is `cp -r`, export is the folder, and sync is whatever the user already points at the directory.

**Rejected: SQLite as the source of truth.** Faster queries with no reconciliation problem, and it is what the app already did. Rejected because it makes every external writer an import problem, which is the opposite of the property `D2` is buying.

**Constraint:** the filename is the title, which `D5` follows from.

### D3 The index is derived and disposable

The index at `.notras/index.db` mirrors the files and is rebuilt whenever it is missing, so deleting it is a supported recovery path rather than data loss.

**Rejected: drizzle-kit migrations.** Standard, and already configured before the rewrite. Rejected because a derived cache does not need schema history: the recovery for any drift is to delete the file.

### D4 Rust is the single writer

Rust writes the index and TypeScript only reads it. `ARCHITECTURE.md` carries how the two halves connect.

One writer removes the transaction-serialization problem the SQLite-first design had. It also means a mutation the app makes cannot leave the index disagreeing with the file, because the same call produced both. An external writer still can: the file changes and the index catches up when the watcher reindexes (`D16`).

**Constraint:** the read gate asks SQLite whether a statement is read-only rather than reading the statement. The first implementation tested the prefix and a code review found a CTE that passes a prefix test and still writes.

**Rejected: writes from TypeScript through Drizzle.** Fewer hops and no IPC round trip. Rejected because two writers to one SQLite file need coordination the single-writer rule gets for free.

### D5 Note identity is the relative path

A note is identified by its path relative to the notes dir. There is no stable ID beside it. Renaming a note renames the file, which the index records as a delete plus a create.

**Superseded in part by `D32`.** This entry also ruled that the filename is the title, on the grounds that deriving one from the first heading is a web-era pattern `D2` removes the need for: the file already has a name and the user sees it in Finder. `D32` overturned that half. Identity carries over untouched.

**Constraint:** creating a note whose title collides dedupes on write, producing `untitled-2.md`.

**Constraint:** a rename can dangle a wikilink, because `D12` resolves links by title. Accepted, and scratch accepts the same.

**Rejected: a stable note ID in frontmatter.** Fixes both constraints above. Rejected because it puts machine bookkeeping into a file the user reads and another tool may rewrite, which weakens the plain-file promise in `D2` for a problem a single user hits rarely.

### D6 Two hand-rolled frontmatter parsers

One dialect, implemented twice, once per language. `ARCHITECTURE.md` names the fields and carries the parity invariant.

The Rust side needs it for indexing, the TypeScript side needs it for editing pins and tags. The dialect is two fields, so two parsers cost less than a shared serialization boundary would.

**Constraint:** the risk this accepts is drift, and the mitigation is that the format is small enough to enumerate. `D32` extends the same obligation to the two title resolvers that read this dialect.

**Constraint:** `title` is parsed and never serialized, so it survives a pin or tag toggle as one of the foreign keys the serializer preserves verbatim. An externally authored note must round-trip through the editor intact.

**Rejected: a YAML library on both sides.** Correct for arbitrary YAML. Rejected because it accepts a much larger surface than the app writes, and because full YAML round-tripping with comment and ordering preservation is harder than the two-field parser it would replace.

### D7 TipTap 3 for the editor

The editor is TipTap 3 WYSIWYG over the official `@tiptap/markdown`, which round-trips GFM in both directions. ⌘P shows the raw file in a single lowlight-highlighted code block.

A CodeMirror 6 live-preview editor was built first and replaced. The existing CM6 live-markdown extensions were dead or alpha, so every rendered construct was hand-rolled as a decoration. `@tiptap/markdown` shipping an official bidirectional serializer made a real WYSIWYG document viable, which is what that work was approximating, so the answer to the effort was to stop paying it.

**Rejected: CodeMirror 6 live preview.** Built, working, and it kept the file and the buffer identical. Rejected because every rendered construct was a decoration the app maintained by hand, against a library that gives the same result as document nodes.

**Rejected: a plain markdown textarea.** Nothing to round-trip and no data-safety risk at all. Rejected because "just write" means seeing the document, and ⌘P keeps the textarea available for anything exotic.

**Constraint:** every editor node must define its markdown form, which `ARCHITECTURE.md` carries as an invariant.

### D8 The editor holds the body, not the file

The editor buffer holds the note body, and `ARCHITECTURE.md` describes the parse-off and reattach under "Body-only editing".

A body save and a pin toggle can race. Composing from the latest loader snapshot rather than the copy the editor started with means the body save cannot clobber a tag or pin the user changed while typing.

**Rejected: frontmatter as an editor node,** which scratch does. Shows the user everything in the file, in one buffer. Rejected because it puts the racing values back into the buffer that the race is about.

### D10 Editor-first layout

The window is the editor. There is no persistent sidebar and no navigation chrome. Launch opens the last-edited note with the editor focused; the empty state is the wordmark, the tagline, and two key hints.

**Rejected: a sidebar list of notes.** The conventional shape, and it makes the note count visible. Rejected because a sidebar is permanently on screen to serve an action taken a few times an hour, which ⌘K covers with a keystroke.

### D12 Wikilinks resolve by title

`[[note title]]` autocompletes from index titles and renders as a clickable pill, with a custom tokenizer and node so it survives the markdown round trip. Resolution is by title, and links are one-directional this pass.

**Amended by `D32`,** which added a filename-stem fallback and a tie-break of nearest folder then path order. A resolved title stopped being unique once it came from content, so resolution needed both a second source and a rule for duplicates.

Wikilinks replaced a links sidebar that pointed outward at the web. Links between the user's own notes are what a folder of files wants.

**Rejected: resolving by path.** Survives renames. Rejected because the user types a title, and `D5` already accepts the dangling-link consequence.

### D14 Layer boundaries

The core and service layers may not reach for a platform, and `ARCHITECTURE.md` states which import each may not make. `D43` records why nothing enforces it today.

The property being protected is that the core and service layers run outside the Tauri webview, in tests today and in anything else later.

**Rejected: separate workspace packages.** The compiler would enforce what lint enforced here. Rejected as too much structure for one app with one consumer of each layer. `D43` retired the lint half of that comparison, so the boundaries now rest on review alone and this rejection is worth revisiting if one slips.

### D15 TipTap's serializer is the canonical form

What lands on disk is whatever `@tiptap/markdown` serializes. The repo's formatter runs on its own source and never on note content (`D41`).

An earlier design ran a remark-based format pass on blur, which carried a question about whether remark-stringify and the repo formatter would agree. Making the editor's own serializer canonical removes both the question and the pass, and the remark and preview stacks with them.

**Rejected: formatting note content on blur.** Produces uniform markdown across externally authored files. Rejected because it rewrites files the user did not change in that session, and because moving the caret after a blur is a visible defect.

### D16 A debounced notify watcher reconciles external writes

A debounced `notify` watcher reindexes external writes and the UI refreshes on its event, which `ARCHITECTURE.md` describes along with the echo and reload guards.

**Constraint:** last-write-wins on an external edit to the open note. Acceptable for a single user, and the reason nothing merges the two versions.

**Rejected: polling the directory.** Simpler and portable. Rejected on latency, since the property being sold is that an agent's write appears within about a second.

**Rejected: an MCP server for agents.** The obvious way to let an AI write notes. Rejected because `D2` already gives agents a write path, and an MCP server is a process to build, run, and keep in sync with the file format. Recorded in `DEFERRED.md`, in case agents ever need richer operations than file writes.

### D18 Lowercase user-facing text

Every user-facing string is lowercase, the wordmark included, and `DESIGN.md` enumerates the surfaces.

**Rejected: sentence case.** The convention, and easier to keep consistent by accident. Rejected because the lowercase reading is the app's voice, and it is enforceable by review since it applies everywhere with no exceptions to remember.

### D19 Shadcn radix-maia on a stone base

UI primitives come from `pnpm dlx shadcn@latest add`, originally in the radix-maia style on a stone base with oklch tokens. **`D22` moved the style to base-maia on Base UI and `D23` replaced the palette**, so only the dark `:root` default and the two constraints below survive.

**Constraint:** files in `src/components/ui/**` are generated and not hand-edited. Lint with no autofix is turned off for them in `biome.jsonc`'s `src/components/ui/**` override rather than patched at the call site, because `scripts/update-shadcn.sh` overwrites the files.

**Constraint:** three deviations are documented, and each is re-applied whenever the components are regenerated.

1. `command.tsx` moves the sr-only `DialogHeader` inside `DialogContent`, which `DESIGN.md` states as an accessibility rule and this entry accepts as a deviation from generated output.
2. Generated user-facing strings are lowercased to satisfy `D18`: the sr-only and footer "close" labels in `dialog.tsx`, the default `title` and `description` in `command.tsx`, and the close button's `aria-label` in `toast.tsx`.
3. `toggle.tsx` gains the `xs` and `icon-xs` sizes `button.tsx` already ships, copied from it. `D37` records why the app needs a 24px toggle that upstream's `h-9` / `h-8` / `h-10` ladder does not reach.

### D20 Quick capture is a second window

The global shortcut opens a small always-on-top window running a bare editor. Esc saves to `inbox/<timestamp>.md` and hides it.

**Rejected: a modal in the main window.** One window to manage and no second webview to boot. Rejected because capture has to work when notras is not the focused app, which is the whole feature.

### D21 No end-to-end tests this pass

Playwright cannot drive a Tauri window, so its smoke tests were deleted rather than ported and wdio plus tauri-driver is deferred. Window behaviour now has no coverage of either kind: `AGENTS.md` says to exercise it under `pnpm dev`, and `D61` records why the written walkthrough that used to carry it is gone.

### D22 Base UI under the shadcn base-maia style

The generated primitives move from the radix-maia style to base-maia, which is the same Maia look on `@base-ui/react` instead of `radix-ui`. `D19`'s two constraints carry over, and `D23` later replaced its palette.

Base UI is one tree-shakable package where `radix-ui` installs 57, and shadcn made base-maia the default in July 2026, so it gets the same updates. The `data-open:` and `data-checked:` variants match both libraries' attributes, so the swap is a regeneration rather than a restyle.

**Constraint:** `asChild` does not exist in Base UI. Composition goes through the `render` prop, and `useRender` covers the cases that used `Slot.Root`.

**Constraint:** `#root` sets `isolation: isolate` in `src/styles.css`. Base UI portals popups to the body after the app root, and the stacking context is what keeps them above page content without a z-index race.

**Constraint:** the palette stays on `cmdk`, which base-maia's `command.tsx` still wraps. `cmdk` pulls `@radix-ui/react-dialog` transitively, so Radix is absent from `package.json` and present in the lockfile.

### D23 The stet palette

Every colour in `src/styles.css` comes from stet, whose source of truth is `packages/tui/src/theme/{dark,light}.ts`, mapped onto the eleven role names shadcn generates against. `--primary` carries the accent: `#ffa7d9` in dark and `#c53794` in light.

notras had no accent. `--primary` was near-white in dark and near-black in light, so the stone base did every job and nothing on screen could be emphasised without inventing a colour. playa.dev already imports this palette from the same source, so adopting it puts three projects on one system at no maintenance cost.

Seven values are playa.dev's lifted variants rather than stet's own, because stet treats contrast as a comfortable target while `src/styles.spec.ts` makes WCAG AA a floor. Each was lifted in OKLCH holding chroma and hue.

**Rejected: authoring a notras palette in the same structure.** The same role vocabulary and the same restraint, in a hue that is notras' alone. Rejected because the value of a shared palette is that it is shared, and a fourth hue is a fourth thing to keep above the contrast floor.

**Rejected: keeping the stone base from `D19`.** Generated, consistent, and already shipped. Rejected because it has no accent, which is the one thing the redesign needed.

**Constraint:** hex replaces the oklch-only rule in `D19`. `color-mix(in oklch, ...)` still interpolates in OKLCH, so the tint recipes are unaffected.

**Constraint:** the card cannot sit at `surface.panel` in light, which drops `--syntax-number` to 3.96:1 against code-block text. `DESIGN.md` states the resulting rule, and `src/styles.spec.ts` gates it.

### D24 Literata on the note surface

The note renders in Literata, a variable serif carrying an `opsz` 7-72 axis, bundled through `@fontsource-variable/literata`.

notras is read as much as it is written. iA's stated goal for its duospace faces is that a monospaced-ish font slows reading down to force a more appropriate writing speed, which serves one half of that at the other's expense. Literata was drawn from scratch for screen reading, commissioned by Google for Play Books, and is the open counterpart to Kindle's proprietary Bookerly.

**Rejected: iA Writer Quattro.** What the app shipped, distinctive, and strongly associated with focused writing. Rejected on the reading half, where its duospace metrics are a deliberate brake.

**Rejected: New York, the macOS system serif.** Apple's own reading serif, already on every Mac and reachable through `ui-serif` since Tauri runs WKWebView. Rejected because the note surface is the one thing that should look the same everywhere the app runs, and a system face makes it the one thing that does not.

**Constraint:** `font-optical-sizing: auto` is what the `opsz` axis buys, and that Fontsource entry is roughly twice the size of the `wght` one. Accepted because the fonts ship in the bundle rather than over a network. `D40` moved the declaration to `.typeset-note`, where `src/styles.spec.ts` now gates it.

### D25 The system sans for chrome

`--font-sans` is `system-ui`, so the palette, dialogs, and status strip render in SF Pro on macOS, Segoe UI on Windows, and the system sans on Linux.

notras is a desktop app before it is anything else, and chrome that matches the OS is chrome the user does not read as a web page. It also removes a bundled font.

**Rejected: DM Sans Variable.** What the app shipped, rendering identically on every platform with a warmer geometric character. Rejected because chrome is the one place where matching the host beats matching itself across hosts.

**Constraint:** one mono serves the editor and the chrome, which is what holds the face count at three.

### D26 Concentric radii

A surface nested inside another takes the parent's radius less the parent's padding, expressed as `calc()` rather than a fixed step on the ladder, which `DESIGN.md` states with its examples.

Apple formalised the rule as `ConcentricRectangle` in SwiftUI, and macOS 26 rebuilt its controls to sit concentrically inside window corners. On a macOS-first app the mismatch reads as carelessness at exactly the sizes the `--radius` ladder produces.

**Rejected: retuning the ladder so the generated classes land concentrically.** Would fix the command palette, whose items sit 4px off. Rejected because the ladder's steps are 4px and 8px apart while the nestings need arbitrary differences, so a retune that fixes one nesting breaks another, and it would move `rounded-2xl` for the tooltip at the same time.

**Constraint:** the command palette stays 4px off concentric. Its item radius lives in `src/components/ui/command.tsx`, which `D19` puts off-limits, and the ladder cannot express the value. Recorded rather than fixed.

### D27 The launch background is restated outside the stylesheet

`--background` is declared four times: as the token in `src/styles.css`, as a `color-scheme` meta plus inline critical CSS in `index.html`, as the window's `backgroundColor` in `src-tauri/tauri.conf.json`, and as two `Color` constants in `src-tauri/src/lib.rs`.

Both the native window and the webview paint before the stylesheet exists. WKWebView paints its default canvas, which is white, unless it is told which schemes the app supports, and the CSS `color-scheme` property cannot say so in time because honouring it waits on the stylesheet. The meta tag is read before the document is drawn, which is the whole reason it works.

Tauri's `background_color` covers the window layer, but its own documentation records "macOS: Not implemented for the webview layer", so on the platform notras targets first the config option alone leaves the white in place.

**Rejected: `backgroundColor` in the config alone.** One value in one place, and no duplication to keep honest. Rejected because it does not reach the webview layer on macOS, which is the layer painting the white a user actually sees.

**Rejected: creating both windows hidden and showing them once the frontend reports ready.** Removes the flash outright and restates no colour anywhere. Rejected because it trades a flash for a delay: nothing would appear until React mounted and four IPC round trips resolved, and a window that takes a beat to show up reads as a slow app rather than a polished one.

**Constraint:** four copies of one value. `src/styles.spec.ts` fails when any copy stops matching its token, which is what makes keeping them safe.

**Constraint:** the config value cannot vary by scheme, so it holds the dark one and `setup()` corrects it from `window.theme()`. A light-mode launch therefore has a frame where the window layer is dark before the correction lands. Moving the `main` window out of the config and building it in Rust would remove that frame, and is the fix if it ever proves visible.

### D28 The titlebar carries the note's identity

The note title, its tags, and the pin toggle live in the window's drag region. `Titlebar` in `src/components/titlebar.tsx` declares that region once.

**Superseded in part by `D30`,** which moves the tags to the status strip. The title and the pin stay, and every other part of this entry carries over.

**Superseded in part by `D38`,** which brings the save glyph into the bar. The rejection below says save state belongs near where the eye rests rather than in the window chrome, and it was written about moving the whole strip up. `D38` re-examines it for one glyph, which the width argument does not reach.

**Superseded in part by `D52` and `D53`,** which move the title into the tab strip and leave one route. The pin and the drag region stay, and the identity the bar carries is the active tab's label rather than a line of text.

The app was spending two bands on one band's work: an empty drag strip above a header. Folding one into the other returns 32px to the note and puts the title where macOS puts a document title. The traffic lights `D29` centres in the bar land on the title's line.

The workspace and the capture window each render their own titlebar rather than the root rendering one, because a shared root strip cannot hold per-surface content and TanStack Router has no named outlet.

**Rejected: keeping the empty strip and shrinking it.** Simplest possible change, and it touches no layout. Rejected because the strip is unavoidable on macOS, so shrinking it converts wasted space into slightly less wasted space, while the header band goes on costing its full height.

**Rejected: moving the status strip up as well.** Frees another 32px and leaves a single band. Rejected because the title, the word count, and three toggles do not fit beside the traffic lights at the 480px minimum width, and because save state belongs near where the eye rests rather than in the window chrome.

**Constraint:** `styles.css` exempts `button` and `input` from dragging, and any other interactive element added to the region needs that rule widened. The title was such an element until `D32` made it display-only text, so the exemption covers the pin toggle and the `.no-drag` class `D35` added for elements that are hoverable without being clickable.

### D29 Compact window controls

`use_compact_window_controls` sets `prefersCompactControlSizeMetrics` on each window's `contentView` and on its three standard window buttons, guarded by `objc2::available!(macos = 26.0)`.

macOS 26 raised standard control metrics, so a window built against its SDK gets 16x16 buttons where every app built earlier has 12x14. notras builds against SDK 26.5, so its buttons were visibly larger than those of apps beside it.

It is set in two places because the documented behaviour covers "NSControls in the view or its descendants", and the buttons are not descendants of `contentView`: they belong to the window's frame view. Setting both costs four lines and does not rest on which mechanism carries it.

**Rejected: building against SDK 15.x.** One `xcode-select` away, fixes every control at once, and is what the community writeup recommends first. Rejected because it pins the whole toolchain to an old Xcode to change one visual detail, and it would have to be reproduced on any machine or CI runner that builds notras.

**Constraint:** nothing else in notras is an `NSControl`, since the interface is HTML in a webview, so this cannot resize anything unintended. That stops being true if native menus or panels are ever added.

**Constraint:** `trafficLightPosition` is `{ x: 16, y: 20 }`, paired with the 36px band in `src/components/titlebar.tsx`. The band was 44px, from erictli/scratch rather than from a reading of what a title bar should be, and `D51`'s survey put that above the median of comparable desktop apps. It is carried twice, in `tauri.conf.json` for the `main` window and as `TRAFFIC_LIGHTS` in `lib.rs` for `capture`, so a band change edits both or the two windows disagree.

`y` is neither a margin above the buttons nor their centre. tao's `inset_traffic_lights` resizes the titlebar container to `buttonHeight + y`, anchors it to the window top, and assigns only `origin.x`, so a button keeps the `origin.y` AppKit gave it and rides down as the container grows. Writing that resting offset as `b`, the button lands `y - b` below the window top and

```txt
y = (height - buttonHeight) / 2 + b
```

`b` is 9 here, which erictli/scratch and Dimillian/CodexMonitor corroborate at 44 with `y` 24 and athasdev/athas at 36 with `y` 20. readest derives the same formula at runtime but measures `b` at 5 to 7, so it is not portable across macOS versions or control metrics and a band change is verified by looking.

Misreading this cost four rounds: 12 in a 36px bar put the buttons at 3pt against content at 18pt and crowded them into the rounded corner, and removing the override entirely traded the misalignment for a bar too tight to breathe.

**Constraint:** the height and the offset are one decision. Changing the band means rechecking the offset, and both sites carry a comment saying so. They are deliberately not covered by a test: they are a verified pair rather than a repeated value, so the only honest assertion would either encode a derivation or pin two literals.

### D30 Tags are picked, not typed

The tag editor is a `Combobox` generated from the shadcn `base-maia` registry, it reads its vocabulary from `NoteService.listTags()`, and it lives in the status strip rather than the titlebar. The palette's `#` token filters through `NoteFilters.tag` instead of scanning the loaded notes in JavaScript.

Both halves of the old tag UX were hand-rolled over capabilities the index already had. `listTags()` and `getTagFilter()` existed with no caller, while a 64px input let a typo fork `standup` from `standups` and the palette substring-matched a vocabulary it recomputed on every keystroke, disagreeing with the index it stood in for.

Tags moved down because the titlebar could not hold them: `D28` put title, tags, and pin in one band, where the chip row was pinned to `w-16` to keep the title readable. The status strip is where the note's other metadata already sits.

**Rejected: keeping tags in the titlebar with the combobox inline.** Smallest diff, and it leaves `D28` whole. Rejected because it keeps the space war that produced `w-16`, and because `D28`'s own constraint requires widening the `button, input` no-drag rule for any other interactive element in the drag region. Moving the tags out satisfies that constraint by deletion.

**Rejected: hand-writing the chips input against Base UI directly.** Base UI ships `Combobox.Chips`, `Combobox.ChipRemove`, and the rest, so the primitives were reachable without the registry. Rejected because the generated file is the one that stays in step with `D22`, and writing it here would put it outside `components/ui/**` where nothing regenerates it.

**Constraint:** a chip in the strip is a filter button, not a `ComboboxChip`. It answers "show me this tag" where a picker row answers "does this note carry it", so it has no remove affordance and `ComboboxChips`, `ComboboxChip` and `ComboboxChipsInput` go unused. Dropping `ComboboxChip` dropped the marking that said a chip was a tag, which is why it carries a literal `#`, and why the picker's trigger is a `TagPlus` icon: a `#` after a run of tag names reads as one more tag.

**Constraint:** the chips box carries `min-w-0` **and** `overflow-hidden` with the add button outside it. `Button` is `shrink-0`, so a container merely allowed to shrink spills its chips over its neighbour rather than clipping them, and `min-w-0` alone clips nothing.

**Constraint:** two call-site overrides sit on the generated popup, because `D19` puts `components/ui/**` off-limits. `ComboboxContent` carries `shadow-2xl ring-1` where `DESIGN.md` specifies a `--border` hairline and `0 8px 24px rgb(0 0 0 / 0.18)`, and `ComboboxTrigger` always appends a chevron, which reads as a dropdown affordance on what is an action button in a 28px band.

### D31 Tags are edited from two surfaces over one implementation

Tag editing is reachable from the status-strip picker (`D30`) and from a `tags` sub-view in the ⌘K palette. Both route through `useNoteTags` in `src/components/notes/use-note-tags.ts`, which owns the optimistic list, the loader sync, and the write.

A note-level action belongs in the palette, and tag editing was the one without an entry there. The palette was the natural second home rather than a new invention: `PaletteView` was already a sub-view machine, `CommandItem` already shipped an unused checkmark, and pin had been a titlebar toggle and a palette action since it shipped.

This entry exists because it reverses a rejection. The same change arrived as a review finding and was turned down, and the leading argument was that it contradicted `D28` and `D30`. That is not a reason. These entries record reasoning so it can be re-examined, and `D28` had been superseded by `D30` in the same sitting. Judged on the merits instead, the finding was right.

**Rejected: the palette only, dropping the strip picker.** Removes a bespoke floating surface and its call-site overrides, and returns about 60px to a strip that is tight at the 480px minimum. Rejected because tagging happens while writing, and it would leave a note with no tags showing no way to add one without opening a dialog.

**Rejected: the strip only, as shipped.** One surface, nothing new to build. Rejected because it left ⌘K unable to do a thing every other note-level action can.

**Constraint:** a surface that edits tags calls `useNoteTags`. Two surfaces over one implementation is the arrangement this entry permits; two implementations is what `DESIGN.md` forbids, and a third surface would take the hook too.

**Constraint:** `useNoteTags` serializes its writes. `NoteService.setTags` is a read-modify-write of the file, and every call site is fire-and-forget, so two overlapping toggles could land in either order and leave disk holding the older set. Writes chain, and a failure rolls back only when it is the newest change, so a superseded request cannot restore a set the user has moved past.

**Constraint:** the per-tag count in the tags view is a plain span, not a `CommandShortcut`. The generated checkmark carries `group-has-data-[slot=command-shortcut]/command-item:hidden`, so an item holding a shortcut slot hides the check that says whether the tag is attached.

### D32 The title resolves from frontmatter, then a heading, then the filename

A note's displayed title is its frontmatter `title:`, else its leading `#` heading, else its filename stem. `ARCHITECTURE.md` names the two resolvers that read that chain.

**Supersedes the filename-is-title half of `D5`.** Relative-path identity carries over unchanged: the path is still the primary key, and nothing here introduces a second identifier.

Two things forced it. The filename constrained the title to what a filesystem accepts, so `NOTE_SEGMENT_PATTERN` banned `/`, `\`, `:` and a leading dot from what is otherwise prose. And `echo "# from claude" > agent-note.md` from a terminal produces a note with two titles that disagree, where the app read the one nobody wrote. `indexes_a_heading_as_the_title` in `src-tauri/src/index.rs` covers it. Stating a title as a heading is the convention every other markdown tool follows, so honouring it is `D2` applied to titles.

`D5` argued from need rather than portability, and Finder is one tool. `D2` promises that any tool writing into the folder is understood, which the old rule kept only for the reader that browses filenames.

**notras never introduces a title, and never renames a file on its own.** It reads all three conventions and imposes none on a file that did not already carry one. This is the part most likely to erode.

Resolving a title is not enough on its own, because nothing puts the sources back in step and so no single act means "retitle this note." A file named `foo.md` holding `# bar` shows `foo` in Finder and `bar` in the app, renaming it looks inert, and editing the heading moves nothing on disk. **The ⌘K action closes that gap,** and `ARCHITECTURE.md` describes what it rewrites.

That sync is deliberately narrow, which is the whole trick. Nothing is ever invented, so a note carrying neither a heading nor a key is left byte-identical and deleting the heading opts it out for good. Because it fires only on an explicit rename, it avoids what made continuous syncing untenable below.

**Rejected: deriving the title from the heading and syncing the filename to it,** which is what scratch does in `save_note`. Finder and a GitHub file listing would always match the title. Rejected because it renames on a content edit: a daily note at `2026-08-16.md` headed `# Sunday, August 16` loses a sortable filename, quick capture's timestamps are eaten the moment a heading is added, and with git sync planned every retitle becomes history churn.

**Rejected: a frontmatter `title:` that notras writes.** Unambiguous, and what Hugo, Astro and Dendron read. Rejected because GitHub renders a frontmatter block as a malformed table above every file it displays, so authoring one degrades reading the vault on the destination the sync plan names.

**Rejected: ordering the heading above frontmatter,** which is what ZenNotes does in `export-title.ts`, reasoning that visible content beats metadata. Kept as the fallback rather than the winner because frontmatter is the only one of the three a person sets deliberately as a title, where a heading usually doubles as one. Notes carrying both are rare, and flipping the order is a one-line change.

**Rejected: leaving the three sources unsynced.** No new writes and no new decisions, which is where this entry first landed. Rejected because it makes the ⌘K rename look broken on exactly the notes the chain was built for, and leaves the app with no act that means "retitle."

**Rejected: syncing the heading but not the `title:` key,** which is [ZenNotes' rule](https://github.com/ZenNotes/zennotes) in `note-heading-sync.ts` and keeps the never-writes claim whole. Rejected because a note carrying a key would still ignore a rename, which is the same defect in a smaller place.

**Constraint:** the heading must be the first non-blank line of the body. A heading further down is a section heading. This is also what lets the extractor skip fenced code blocks without tracking them, since a fence opener cannot match the heading pattern.

**Constraint:** a title round-trips only for a note with somewhere to keep one. A note with neither a heading nor a key falls back to its filename, so retitling `Effect: A Primer` there displays `effect-a-primer`, the slug, because the filesystem cannot hold the colon and nothing may be invented to hold it.

**Constraint:** `filenameFromTitle` lowercases and hyphenates, and does not fold non-ASCII, so `café notes` yields `café-notes.md`. That keeps the exposure to the macOS NFD versus NFC filename mismatch, which is not a regression, since nothing stopped that filename before.

**Constraint:** a title is written into a heading verbatim rather than markdown-escaped, so `my *title*` renders as emphasis and reads back byte-identical. Escaping would break the round trip unless the read path unescaped too.

**Constraint:** the two resolvers stay in parity, the same way `D6` binds the two frontmatter parsers. `ARCHITECTURE.md` carries it as an invariant.

**Constraint:** the titlebar title is display-only, so renaming a file is a ⌘K action. `D28`'s note about an editable input in the drag region no longer applies to the title.

**Constraint:** a resolved title is not unique. `D12` gains a filename-stem fallback and a deterministic tie-break, because the filesystem no longer enforces uniqueness over the thing being displayed.

### D33 The icon is generated from a vector master and a render, split by size

`scripts/icons.sh` builds every file in `src-tauri/icons/` from sources in `assets/`. Four vector files carry the mark and a 1254px clay render carries the large sizes. Sizes at 16px come from `icon-tiny.svg`, 17 to 40 from `icon-small.svg`, 41 to 96 from `icon.svg`, and 97 and up from `icon-render.png`. `iconutil` assembles the ten representations into `icon.icns`, because `pnpm tauri icon` takes one source per run and the icns spans 16px to 1024px.

Detail has to drop out as pixels run out. An eye is 4.1% of the tile and an accent dot 2.5%, so at 32px the dot is down to 0.6px and reads as colour noise, and at 16px two eyes merge into a bar that reads as a smudge. So `icon-small.svg` drops the accent and the back blob's eyes and enlarges the remaining pair, and `icon-tiny.svg` drops every dot and keeps the two-blob silhouette. The icon is the accented variant at large sizes and close to monochrome at small ones.

**Rejected: one `tauri icon` pass from a single source.** One command, no script, and nothing to keep in step. Rejected because a single source cannot vary detail by size, and the same artwork scaled to 16px is the smudge above.

**Rejected: shipping the render as it arrived.** It is opaque, with a flat `#0f1013` surround and its tile inset inside a 1254px canvas, so it would put a dark square in the Dock where a squircle belongs. The script crops to the tile, masks it to a superellipse, and centres it on Apple's grid instead.

**Rejected: keying the icon's palette to the tokens.** The reference sheet's swatches are the light palette, and `DESIGN.md` says every colour is a token. The render is a lit scene, so its tile reads `#1c1e21` against the token's `#2a2e33` and its accent `#913168` against `#c53794`. Matching the tokens in the vector files would have made the icon visibly change shade between 64px and 128px inside one icns, so the vector files match the render instead.

**Rejected: a Node script with a rasterizer dependency.** `tsconfig.json` covers `**/*.ts` and the linter reaches everything outside its ignore list, so it would be typechecked and linted, and knip's `project` glob does not reach `scripts/`, so the dependency would read as unused. Bash sidesteps all four gates and matches `scripts/update-shadcn.sh`.

**Constraint:** generation is macOS-only and needs ImageMagick on the PATH. `iconutil` ships with macOS and `magick` does not, so the script checks for both and names `brew install imagemagick`. No CI step runs it.

**Constraint:** the crop constants in `scripts/icons.sh` were measured against this render. Its tile is 972x972 at (141, 113) in a 1254px canvas, sitting 28px above centre, with a superellipse exponent near 4.7 solved from four edge scanlines. A replacement render has to be re-measured, so the script asserts the source is 1254px square and fails loud when it is not. `D34` takes the shipped shape to exponent 5.0; the 4.7 here still describes the render and still governs the crop.

**Constraint:** the tray asset is one 36px square. `tray-icon` hardcodes an 18pt height and scales by aspect ratio, so a second file would never be read, and the glyph fills 92% of its frame to sit right in the menu bar.

### D34 The icon's edge follows measured macOS geometry

The tile is a superellipse at exponent 5.0 on Apple's 824-on-1024 grid, carrying a lit edge ~20px wide and a soft drop shadow offset ~10px down, blurred 13px, at 17% opacity. Every figure comes from measuring the platform rather than from a spec: this machine runs macOS 26, so the ICNS containers of seven system apps were parsed and probed directly.

Those apps agree exactly. All seven put the art at 80.5% of the canvas with a 9.8% margin and fit an exponent of 5.00. Five of five bake a drop shadow into that margin, which is what the margin is for, reading 13% alpha two pixels below the shape and 3 to 4% above. `scripts/icons.sh` paints at 17%, because a blurred shadow loses alpha at the point the probe reads and 13% measured there needs more than 13% laid down. The lit edge is not universal, since Notes reads 238 at its boundary and Maps 251, both being light icons; it is shared by the dark-tiled ones, TV and Terminal, which run 144 at the boundary down to their base over five pixels. Those two are the precedent a `#1c1e21` tile follows.

**Amends `D33`.** The exponent 4.7 recorded there stays true of the render and is still what the crop uses; it is no longer the shape notras ships.

**Rejected: keeping the render's 4.7.** It cost nothing and the mask already existed. Rejected because it is the shape an image model happened to draw, and matching the platform is the whole reason the icon is a squircle rather than a rounded rectangle. The gap is 9.4px on an 824px art square, worst near the middle of the straight sides, so Apple's reads fuller and flatter-sided.

**Rejected: masking the render at 5.0 without redrawing the tile.** One fewer step. Rejected because 5.0 extends 4.5px beyond 4.7, so the mask reaches past the artwork and exposes its opaque `#0f1013` surround as a fringe. The render is composited onto a tile drawn at 5.0 instead, and the rim covers the 4.5px seam with 19px to spare.

**Rejected: a `.icon` package for system-drawn Liquid Glass.** `tauri-bundler` supports it, but `actool` ships inside Xcode and only the Command Line Tools are installed here, so the build logs a skip and ships the `.icns` alone. Recorded in `DEFERRED.md` rather than closed.

**Constraint:** the tile shape lives twice, as bezier data in `assets/*.svg` and as the `-fx` mask in `scripts/icons.sh`, and nothing derives one from the other. `assert_svg_tile_matches_mask` rasterizes `icon-tiny.svg`, whose alpha silhouette is the tile because its blobs sit wholly inside, and diffs it against the mask at 512px. Tolerance is 0.005 against 0.0022 of antialiasing. It earned its place on the first run by catching a 1px inset that would have split the silhouette across sizes.

**Constraint:** the rim and shadow are rebuilt at every output size rather than downscaled from the master, so a 16px icon gets a sub-pixel edge instead of a blurred one. `scripts/icons.sh` carries the distance-map mechanics that make it work.

**Constraint:** generated PNGs are written with `-strip`. ImageMagick embeds `png:tIME` and `date:` chunks, which left the output pixel-identical but byte-different on every run, so regenerating dirtied 19 binary files in git for no change.

### D35 The save state is a glyph

`SaveIndicator` renders one lucide save icon per state. This entry decides the three that existed when it was written: `SavePenIcon` for `dirty`, `SaveIcon` for `saving`, `SaveCheckIcon` for `saved`. All three share a floppy body and differ in the badge at its lower-right corner, so the shared shape names the subject and the badge names the state. The word survives in a hover tooltip and in `sr-only` text. `D38` adds a fourth state and keeps the rule.

The strip opened on a word that rewrote itself on every keystroke, `unsaved` to `saving...` to `saved`. It was the widest item in the row and the only one that changed while the user was reading the note above it, and a second surface spelled the same state a second way.

**Rejected: the word.** What shipped until now, and the only version that says what it means without being hovered. Rejected because a status nobody acts on does not earn the widest slot in the strip, and because the churn was the complaint.

**Rejected: a bare dot,** which is what editors use for an unsaved buffer. Rejected because a dot names no subject. In a strip already carrying tags, a count and three toggles, it reads as an indicator of something.

**Rejected: showing nothing once saved.** The quietest option, and defensible for an app that autosaves. `D38` re-rejects it on harder grounds once a `failed` state exists.

**Constraint:** the glyphs differ by a badge roughly 4px wide at `CHROME_GLYPH`, so tone carries the rest and `DESIGN.md` assigns it. Changing a tone makes the states harder to tell apart rather than only quieter.

**Constraint:** the indicator is a status and not a control, so its tooltip trigger renders a `span`. It takes no tab stop and hover is the only opener, which is why the `sr-only` text exists rather than an `aria-label` on the svg. That is also why it needs `no-drag`: `D38` moved it into the drag region without the class and the tooltip was dead until `SaveIndicator` carried it, which `src/styles.spec.ts` now asserts.

### D36 Every item in the status strip is a shaped item

The strip sets one gap and each item carries its own padding, which comes from the component it is. The footer is `px-3 gap-1`, each run of like items is `gap-0.5`, and nothing overrides a variant to reach a number.

**Superseded in part by `D38`,** which moved the save glyph out of the strip and into the titlebar. The recipe stands and the strip is one item shorter.

`DESIGN.md` lists which component each item is. The distances that fall out are an outcome rather than a target: spacing is stated once, at the footer, and adding an item means choosing what the item is rather than re-deriving a sum.

**Rejected: holding equal optical gaps by hand.** The first version of this entry did, with `px-1` on two chips, a `size-6` box on the glyph, and a wrapper `div` carrying a third gap. It was exact on the day it was written. Rejected because a text pill and an icon square have different padding by nature, so equality between them is a coincidence someone re-establishes after every change, and nothing in the gate notices when it lapses.

**Rejected: one gap and no shaped items.** Simplest possible rule: give the footer a gap and leave every child as it was. Rejected because the word count is bare text with no inset while a chip carries 10px, so the same gap yields distances 10px apart no matter which gap is chosen. Shaping the items is what lets one number work.

**Constraint:** the chips are the only part of the strip that shrinks, so `min-w-0` has to reach `NoteTags` unbroken from the footer. The wrapper `div` that briefly sat between them is gone, and any future one carries `min-w-0`.

**Constraint:** the gap inside a control is not one of these numbers. The space between the `TagPlus` icon and the words `add tag` is the badge's own `gap-1`.

**Refined by `D72`:** `add tag` is a `Badge` rendered as a button, like the tag chips and the mentions count beside it. As a `Button size="xs"` it stood `h-6 px-2.5` in a row of `h-5 px-2` items, and the same focus ring around a taller box made the three read as two kinds of control.

### D37 Chrome toggles come from `Toggle`, at one size and one on-state

Anything in chrome that turns on and off is `Toggle` or `ToggleGroupItem` from `@base-ui/react`, at the size and on-state `DESIGN.md` states. Two hand-rolled versions preceded it, one per surface, drawing their on-states in the accent and the primary, which `DESIGN.md` rules out of chrome.

The three view toggles are one `ToggleGroup` but stay three independent settings: `StatusBar` takes three booleans and three handlers, and a descriptor array routes a change back to the one whose membership flipped.

**Rejected: `Marker` for the save indicator.** Named as a candidate, and its anatomy is the right shape, an `aria-hidden` icon slot beside content. Rejected on its classes: the root is `flex min-h-4 w-full items-center gap-2 text-sm`, where the strip needs neither full width nor `text-sm`, its variants are a `::before`/`::after` hairline separator and a `border-b` row, and `role="status"` is not built in. Adopting it means overriding `w-full` and `text-sm` to arrive back at the span already there.

**Rejected: `ButtonGroup` for the toggles.** The other named candidate. Rejected because its horizontal variant attaches its children, `rounded-r-none` on every slot and `border-l-0` on each one after the first, which turns a spaced run into one continuous control. The toggles read as separate at 12px and that reading is the one being kept.

**Constraint:** the on-state is a `className` at the call site, not a change to the generated variant. `toggleVariants` ships `aria-pressed:bg-muted` alongside `hover:bg-muted`, so pressed and hover would be the same surface; `aria-pressed:bg-transparent aria-pressed:text-foreground` overrides it through `cn`, whose `twMerge` drops the losing class rather than relying on stylesheet order.

**Constraint:** the generated `toggle-group.tsx` carries `data-[state=on]:bg-muted`, a Radix attribute Base UI does not emit. It is dead and stays dead, since `src/components/ui/**` is not hand-edited beyond `D19`'s listed deviations. `aria-pressed` is the working hook.

**Constraint:** `toggle-group.tsx` added four rules to the `src/components/ui/**` override block, which `D19` names as where lint with no autofix in generated files goes. `D41` moved the block to `biome.jsonc` and re-derived its contents from the rules Biome reports.

### D38 The save glyph sits in the titlebar and can say it failed

`SaveIndicator` renders after the tab strip and before the pin, and `SaveStatus` carries a fourth member, `failed`, drawn as `SaveOffIcon` on `--destructive`.

**Superseded in part by `D52` and `D53`,** which move the note's title into the tab strip and leave one route. The placement and the route counts below have been corrected to the code those two left. The four states and the case for putting save state in the bar are unchanged, and the rejections stand as written.

The app had two answers to where it goes. `notes.$.tsx` put it first in the status strip and `external.tsx` put it in the titlebar, because that route had no strip. Both were routes in the `main` window, so the split showed inside one window. Both windows render a `Titlebar`, the capture window an empty one; only the workspace renders a `StatusBar`, and only with a tab open. The bar the app has everywhere is the one that can hold this.

That leaves the strip carrying the note's own metadata and the view controls, with no app state in it, and the titlebar carrying what the note is: its tab's label, whether it is pinned, whether it is written.

The `failed` member matters more than the placement. `useAutosave` caught a failed write, restored the buffer and set `dirty`, which is the state a keystroke produces and is drawn with the same glyph and the same `unsaved` label. A disk refusing writes and a note typed into half a second ago were identical on screen. Nothing else covered it: pin toggles, tag edits and even copying a code block toast on failure, while the note body did not, and the only save-failure message in the app arrived from the quit handshake when the user pressed ⌘Q.

**Rejected: the strip's leading slot,** where it shipped. Rejected because it is the most prominent position in the band, held by the least informative item in it whenever nothing is wrong, and because it cannot be applied to the external route without giving that route a status strip it does not otherwise need.

**Rejected: a toast from `useAutosave`,** matching `external.tsx`, which already does this. Rejected because that write is debounced and retried on every keystroke, so a disk that keeps refusing stacks a toast per attempt. The route that toasts does so from a single debounced callback and now sets `failed` as well.

**Rejected: hiding the glyph once saved,** revisited from `D35`. Rejected again, and harder now: with `failed` as a real state, a hidden `saved` would make "nothing on screen" mean both "written" and "this route does not show it".

**Constraint:** `failed` clears on its own rather than being dismissed. A later keystroke sets `dirty`, and the next flush either lands in `saved` or returns to `failed`. There is no acknowledge action and no retry timer.

**Constraint:** the tooltip reads `could not save`, a fixed string, while `run.ts` unwraps a specific message that the `catch` still discards. Carrying the real one means threading it through `useAutosave`, the tab snapshot and `SaveIndicator`, which is its own change.

**Constraint:** the glyph costs the strip another 36px at the 480px minimum width, on top of what the traffic-light inset and the pin already take. `D52` re-ran the measurement when the tabs arrived.

**Constraint:** the rejection above covers a note that is open. With no tab open there is no save state to report, so the glyph is absent from the empty state and the title bar holds the strip's `+` alone.

### D39 The task row recipe stops at a task list's own children

Every selector styling a task row in `src/styles.css` reaches it as `ul[data-type="taskList"] > li`, the list is padded like any other list with the row pulled back by the checkbox column, and a list marker takes the muted tone rather than the border one.

**Superseded in part by `D40`.** The scoping and the shared ladder stand, and so does the method for measuring a marker column, which was re-run. Every number below moved: the ladder is Typeset's `1.5em` plus `0.4em`, the checkbox and the gap are `em` rather than `rem`, and `--tw-prose-bullets` no longer exists, with Typeset painting every `::marker` from `--typeset-muted`. The pull-back staying in step with the checkbox and the gap is no longer unenforced.

The recipe arrived from scratch as descendant selectors. A task item's content is `paragraph block*`, so a bullet list nested under a task renders as a plain `ul` of plain `li` inside the item's content div, and `ul[data-type="taskList"] li` matched every one of them. The row rule sets `display: flex`, which is not `list-item` and so generates no marker box at all, and a list nested under a task rendered with no bullets and no numbers. The same selector zeroed those items' margins and claimed the `.code-block-wrapper` div of a fence sitting in one.

The scoping alone puts no bullet on screen. The bullet colour pointed at `--border`, which measures 1.27:1 in dark against the background, so a restored disc is a shape nobody can see while a restored number is legible. The stylesheet answered "what colour is a list marker" two ways on adjacent lines, and `--border` is not one of the text tones `DESIGN.md` names.

A task list also sat on its own indent ladder, stepping 1.4em per level from a left edge of 0 while every other list stepped 2em from 2em, so two lists at one indent in a file started at different left edges on screen and drifted further apart with depth. Padding the list and pulling the row back puts the checkbox in the gutter a marker would occupy, which lands every list kind on one ladder.

The gap inside the row was then measured rather than chosen. `::marker` is not in the DOM and has no box to query, and where WebKit paints one inside the gutter does not follow from the box model, so the number came off a rendered frame: the built stylesheet through `qlmanage`, which draws with WebKit, scaled against a 320px calibration bar. A disc and a `1.` paint as right-aligned boxes whose ink edges differ by the glyphs' own widths, and the gap is whatever lands the checkbox's right edge on the disc's.

**Rejected: a class on the task item, handed down from `extensions.ts`.** `TaskItem.configure({ HTMLAttributes: { class: ... } })` reaches the node view, and `TableKit` passes `not-prose` that way already, so the precedent is there. Rejected because the schema states the relationship: `TaskList.content` is `taskItem+`, so a direct-child `li` of a task list is a task item and no other `li` is. A class restates that in a second file and leaves the descendant selectors free to come back.

**Rejected: restoring `display: list-item` on nested items.** One rule and the markers return. Rejected because the leak stands: the same selectors still zero those items' margins and still claim their `div` children, and the next declaration added to the row rule leaks again with nothing to catch it.

**Rejected: adding `border` against `background` to the contrast gate.** It would have failed on the measured numbers. Rejected because `--border` is a border token everywhere else it is used, and putting it in a list of text pairs treats the symptom rather than the role pointing at the wrong token.

**Constraint:** `TaskItem` ships an `addNodeView`, which receives only the extension attributes. The `li` in the editor carries `data-checked` and never the `data-type="taskItem"` that `renderHTML` writes, so a selector on that attribute matches nothing. `src/components/editor/extensions.spec.ts` pins the shape.

**Constraint:** where a disc paints is an observation about one engine rather than a value the specification pins. An engine update that moves the marker moves the alignment, and the check is to re-render the probe rather than to reason about it.

**Constraint:** the checkbox selectors reach the input as `> li > label > input` and drop the `[type="checkbox"]` filter. The label is the node view's own wrapper and holds one input, so the path names the element more narrowly than the attribute did, and it holds the selector inside the formatter's 80 columns.

**Constraint:** `src/styles.spec.ts` reads rule preludes by tracking brace depth over `src/styles.css`. It drops comments and `url()` values first, because either can carry a brace, and a declaration value that grows one would read as a selector.

### D40 shadcn/typeset renders the note surface

The note surface takes shadcn/typeset, vendored verbatim at `src/typeset.css` and refreshed by `scripts/update-typeset.sh`. `@tailwindcss/typography` is gone, and the sixteen `--tw-prose-*` repoints with it. The editor container carries `typeset typeset-note`, and `.typeset-note` sets three rhythm controls and three faces.

Typeset reads `--color-foreground`, `--color-muted-foreground`, `--color-border`, `--color-muted`, `--color-primary`, `--color-ring`, and `--radius` directly, all of which the `@theme inline` block already emits. The reading surface lands on the palette with nothing to repoint, which is the problem `D23`'s constraint existed to solve. Heading sizes, list indents, and the gap under a heading derive from `--typeset-size`, `--typeset-leading`, and `--typeset-flow`, so the preset is the whole tuning surface at six declarations. The built stylesheet goes from 104.35 kB to 103.36 kB.

**Rejected: staying on `@tailwindcss/typography`.** It is built for exactly this job and the app shipped on it for two palettes. Rejected because it ships a stone ramp, so every colour on the app's most-read surface had to be repointed to undo it, and a plugin whose defaults have to be cancelled in sixteen declarations is being fought rather than used.

**Rejected: overriding Typeset's heading scale to keep the app's own.** `1.6em`, `1.35em`, `1.15em`, `1em` was documented in `DESIGN.md` and shipped. Rejected because the heading margins derive from `--typeset-flow` either way, so the override would buy only the sizes, and a preset that restates half the stylesheet it sits on stops being a preset.

**Rejected: vendoring the file reformatted to house style.** The repo formatter handles CSS and would reflow it, and the file carries about twenty section comments `AGENTS.md` bans in first-party code. Rejected because a file with no registry entry has no upgrade path except a re-fetch and a diff, and reformatting turns every re-fetch into a whole-file diff merged by hand.

**Constraint:** Typeset has no registry entry. `https://ui.shadcn.com/r/typeset.json` is a 404, and the `shadcn` CLI carries no `typeset` anywhere in its dist, so there is no `shadcn add` for it and `components.json` is untouched. `scripts/update-typeset.sh` re-fetches `https://ui.shadcn.com/typeset.css`, which is the 12142 bytes vendored at `src/typeset.css`.

**Constraint:** h6 carries `text-transform: uppercase`, so a note holding `###### foo` draws `FOO`. This is a WYSIWYG editor over the user's own file, and it is the one place the surface draws characters the file does not hold.

**Constraint:** the note re-sizes at 768px, which `DESIGN.md` states. The minimum window is 480px, so both sizes are reachable by dragging one edge.

**Constraint:** the checkbox, the flex gap, and the row's pull-back are all `em`. Typeset's list paddings are `em` and its size changes at 768px, so a `rem` checkbox beside an `em` marker column drifts out of the gutter whenever the size moves. Measured at both sizes, the checkbox's right edge holds within `0.016em` of the disc's.

**Constraint:** the inline-code chip pins its colour rather than inheriting, because this app paints five roles in `--muted-foreground` and a muted glyph on the `--muted` chip measured 3.73:1 in dark and 3.37:1 in light. `src/styles.spec.ts` caught it and gates both halves. `DESIGN.md` states the resulting rules for the chip, the markers and the opted-out table.

**Constraint:** the marker column was re-measured through `qlmanage` per `D39`, and the fonts have to be loaded to do it. Rendering the probe with the font URLs unresolved put the disc at `0.426em` to `0.782em` against `0.320em` to `0.747em` with Literata, so a probe missing its faces measures the fallback serif and reports a column the app never paints.

**Constraint:** a task list still sets `margin-block: 0.5em` where every other block takes `--typeset-flow`, so it sits tighter to what precedes it than a bullet list does. The plugin had the same split and this change did not widen it.

### D41 Ultracite replaces the ESLint and oxfmt pair

Lint and formatting come from `ultracite`, a Biome preset, extended in `biome.jsonc` as `core`, `react`, `tanstack`, and `vitest`. `pnpm check` and `pnpm fix` are the two commands. `eslint.config.ts`, `.oxfmtrc.json`, `.lefthook.json`, and `@jimmy.codes/eslint-config` are gone, and CI runs one check step where it ran a format step and a lint step.

The whole config is under forty lines: four extends, a two-entry `files.includes`, and one override. Writing more than that was the first attempt and it went backwards, which is the constraint below.

**Rejected: porting every ESLint rule to Biome.** The first pass ported the two layer-boundary blocks and the lucide import guard, and the config reached about a hundred and twenty lines. Rejected because a preset that needs that much configuration is not doing the job the preset was adopted for, and because two of the three ported guards had never caught anything the repo still contained. `D43` covers what that dropped.

**Rejected: keeping oxfmt for markdown and YAML.** Biome handles neither, so those files now have no formatter. Rejected because the binary was already uninstalled, `pnpm format` was already broken, and the markdown here is hand-wrapped at 80 columns anyway. Reinstating a second formatter to cover two file types costs more than it returns.

**Constraint:** a consumer `files.includes` must not contain `"**"`. Biome's own `noBiomeFirstException` rule reports it, because a catch-all in the consumer replaces the preset's ignore list rather than extending it. Adding `"**"` put `src/routeTree.gen.ts` back in scope and raised the error count from 210 to 218. The two exclusions are written bare: `!!src/typeset.css` and `!!assets`.

**Constraint:** `@biomejs/biome` is a direct devDependency and sits in knip's `ignoreDependencies`. Ultracite's peer dependencies are `oxfmt` and `oxlint`, so nothing pulls Biome in transitively, and knip's Biome plugin reads `biome.jsonc` without marking its own enabler as used.

**Constraint:** the `AGENTS.md` comment rule lost its enforcement. ESLint's `no-inline-comments`, with a `TODO|FIXME` escape hatch, was checking it, and Biome has no equivalent.

### D42 Fire-and-forget promises carry no marker

A promise the code deliberately does not await is called plainly. The `void` prefix that used to mark thirty-three such calls is gone.

`@typescript-eslint/no-floating-promises` ran with its default `ignoreVoid`, so `void` was how a call opted out of that rule, and the prefix accumulated at every hotkey handler, `listen` cleanup, and debounce timer. `D41` removed the rule, and Ultracite bans the `void` operator through `complexity/noVoid`, so the marker had gone from required to forbidden in one step.

**Rejected: turning `noVoid` off and enabling `nursery/noFloatingPromises`.** This reproduces the old semantics exactly, verified: `void` stays the sanctioned discard and an unhandled promise errors. Rejected because it is two rule overrides in a config `D41` deliberately keeps small.

**Rejected: giving all thirty-three a `.catch`.** Every fire-and-forget would report its own failure. Rejected because it changes runtime behavior across eleven files, which is a separate change from a lint migration.

**Constraint:** nothing now distinguishes a deliberate fire-and-forget from a forgotten `await`. An un-awaited `saveNote(...)` with no `.catch` passes every gate, and the failure surfaces as a rejection nobody reports.

### D43 Layer boundaries and the icon import rule are conventions

`D14`'s two layer boundaries, written in `ARCHITECTURE.md`, and the rule that `lucide-react` imports use the `Icon`-suffixed export, written in `AGENTS.md`, are checked by nobody.

Biome expresses both: `style/noRestrictedImports` takes gitignore-style groups, and its `invertImportNamePattern` covers the icon rule despite the Rust regex engine supporting no lookahead. Porting them cost about seventy lines of the hundred and twenty `D41` rejected.

**Rejected: a spec that reads the source and asserts on imports.** `src/styles.spec.ts` already guards `D27`, `D39`, and `D40` that way, so the pattern exists and would have cost about fifty lines of test instead of seventy lines of config. Rejected together with the config, on the same ground: neither had caught anything, since all eleven files importing `lucide-react` already comply and no boundary is currently crossed.

**Constraint:** a violation of either now reaches `main` unless a reviewer catches it. `D14` rejected workspace packages because lint was doing the work, and that comparison no longer holds, so a boundary that actually slips is a reason to revisit it rather than to re-add the rule.

### D49 release-please owns the version, and the crate version is frozen

`package.json` carries the only version in the repo. release-please bumps it, `src-tauri/tauri.conf.json` reads it through `"version": "../package.json"`, and `src-tauri/Cargo.toml` is pinned at `0.0.0` behind a comment saying so. Nothing reads `CARGO_PKG_VERSION`, and the crate is never published, so the frozen value names nothing.

The freeze is not separable from the tool. No release-please configuration updates `Cargo.toml` and `Cargo.lock` together: the supported `extra-files` types are `generic`, `json`, `yaml`, `toml`, `xml` and `pom`, and while a `CargoLock` updater exists, only the `rust` release strategy reaches it and that strategy expects the crate at the repository root, which a Tauri app does not have. The `generic` updater needs an `x-release-please-version` annotation comment, and cargo rewrites `Cargo.lock` without preserving comments.

**Rejected: tag-driven versioning that commits nothing.** Yaak stamps the version from `github.ref_name`, GitButler writes a computed one into a temporary config, and `tauri build --config` merges an inline `{"version": "..."}`, so injection costs one line and no file can drift. Rejected because a grouped conventional-commit `CHANGELOG.md` is wanted and is the one thing hard to get without release-please, and because stet already runs release-please, which keeps both repositories on one system.

**Rejected: bumping `Cargo.toml` through `extra-files`.** Two projects run that configuration and bracket what it costs. `zmkfirmware/zmk-studio` ignores the lockfile, so its `Cargo.toml` reads `0.3.1` while the `app` entry in its `Cargo.lock` still reads `0.1.0`. `bminier/claude-scope` keeps the lockfile correct by adding a second workflow job, a Python script, and a bot commit pushed back into the release pull request, and its own comment records the remaining hole: the bot pushes as `GITHUB_TOKEN`, which does not re-trigger CI, so a maintainer has to re-run CI by hand before merging.

**Constraint:** `cargo test --locked` joins the verification gate and runs in `ci.yml`'s `rust` job, which the release workflow calls against the tag. Restoring a real version to `Cargo.toml` without also solving the lockfile fails there instead of shipping.

**Constraint:** Tauri resolves a `version` path relative to the config file's own directory, not the project root, so `"../package.json"` depends on `tauri.conf.json` staying in `src-tauri/`.

### D50 One workflow is the gate, and the release calls it

`ci.yml` carries `pull_request`, `push` on main, and `workflow_call`. It holds every automated check the repo has: knip, typecheck, check, coverage and the web build on one job, `cargo test --locked` on a macOS and Linux matrix, and actionlint plus zizmor over the workflow YAML. `release.yml`'s `gate` job calls it with the tag it is about to publish, because the release pull request is opened by GITHUB_TOKEN and never fires `pull_request`, so the tagged tree would otherwise reach a publish with nothing run against it.

**Rejected: a separate reusable workflow with a forwarding `ci.yml`.** The gate lived in its own `gate.yml` for one pass, with `ci.yml` reduced to a trigger block wrapping a single `uses:`. Rejected because the file only forwarded, so reading it told you nothing about what CI runs, and because a called job's status check is named `<caller job> / <called job>`, which put a prefix on every required context to name the forwarder. One file that declares all three triggers does the same work.

**Constraint:** the cache flag is inverted. A `workflow_call` input is not populated on `push` or `pull_request` and its `default:` does not apply there, so a positive `save-cache` would read falsy on every direct run and stop the writes the `push` arm exists for. It is `skip-cache`, and absent means write.

**Constraint:** the concurrency group carries the handed ref. A called workflow resolves `github.workflow` to its caller, so a group built from that alone collides with the caller's own group and cancels it.

**Constraint:** a `workflow_dispatch` redrive of a tag cut before this change fails. `ci.yml` resolves `./.github/actions/setup-rust` and `release.yml` resolves `.github/homebrew/` out of the checked-out tag, and no tag through v0.1.2 carries either.

### D51 Chrome glyphs take a role-based rung, stated outside the generated variant

A standalone glyph in a chrome control is `CHROME_GLYPH` in `src/lib/ui/chrome.ts`, covering the save indicator, the pin and the three view toggles. An icon beside a word takes the 12px its button variant already gives it, uncorrected, which is `add tag` and the palette's pin marker. The rung follows the role the icon plays, not the band it sits in.

The app had three numbers for one thing, and the pin and the save glyph sat adjacent in the titlebar in identical 24px boxes at different sizes, which is how it surfaced. A pass at 12px, the `icon-xs` rung's own value, came first and was too small for a control.

**Rejected: editing the `icon-xs` variant.** The obvious fix, needing no call-site class at all. Rejected because `icon-xs` is defined twice, in `toggle.tsx` as this repo's `D19` deviation and in `button.tsx` as upstream's, and `scripts/update-shadcn.sh` patches nothing back. Editing one makes a rung name mean two sizes; editing both adds a deviation regeneration silently reverts. `D37` met the same fork for the pressed state and put the override in a named constant, which is what `PRESSED` is.

**Constraint:** `saved` came off `--faint`, which is 2.65:1 in dark and below the 3:1 WCAG sets for non-text, and onto the `opacity-60` the pin beside it already uses when idle. So the glyph is `--foreground` while a write is outstanding and dim once it lands, which is `DESIGN.md`'s muted-when-idle rule rather than a tone of its own.

**Constraint:** the glyph carries `[stroke-width:2.25]`. Lucide's stroke is 2 against a 24-unit `viewBox`, so it scales with the glyph and 14px would render 1.167px, lighter than the 1.333px an unstyled lucide icon draws at 16px here.

### D52 Tabs, in the title bar, where the note's title used to sit

Open notes are a strip of tabs in the 36px title bar, from `src/components/tabs/tab-strip.tsx`. The save glyph and the pin stay at the right in `NoteControls`, and the note's title is now the active tab's label. `DESIGN.md` carries the shape.

**Amends `D10`,** which rejected navigation chrome because ⌘K finds a note in a keystroke. That reasoning holds and this does not contest it. Tabs answer a different question: which notes are open at once, and how to return to one without losing your place in it. Finding a note and keeping it open are not the same act, and the palette stays the way notes are found.

**Amends `D30` and `D38`,** which recorded that the title bar has no horizontal room: tags moved out because a variable-width chip row would not fit, and the save glyph already cost the title 36px. The measurement stands. At the 480px minimum, the traffic-light inset, the trailing padding, the save glyph and the pin leave 312px. The strip fits because a tab is not a chip: tabs shrink to a floor and then scroll, so the count grows without the width doing so.

**Rejected: a third band below the title bar.** Full window width, no competition for the 312px, and `DESIGN.md`'s "two bands frame the note" left intact. Rejected because it spends about 30px of vertical room permanently on navigation, in an app whose window is the editor, to solve a horizontal problem that scrolling already solves.

**Rejected: Base UI's `Tabs`, which shadcn would supply.** It wires the `tablist`/`tab`/`tabpanel` roles with `aria-controls` and `aria-labelledby` from a panel registry, and adds roving focus and `inert`, all of which this hand-rolls. Rejected on the panel half: `TabsPanel` puts the `hidden` attribute on a kept-mounted inactive panel, and `hidden` is `display:none`, which destroys the scroll box `D53`'s live editors depend on. Taking it means shipping a CSS rule whose only job is to defeat the component's own hiding, and `Tabs.Tab` reads `aria-controls` off that same registry, so the list cannot be adopted without the panels either.

**Constraint:** the two chrome tones say which tab is active, not the fill. The fill only says it in dark; in light `--card` is `#ffffff` against a `#f7f8fa` page, so the active tab is the darker of the two. Darkening the band instead drops `--muted-foreground` on it to 4.23:1, under the 4.5 `src/styles.spec.ts` enforces.

**Constraint:** ⌘⇧T is reopen-closed-tab, so editing tags moved to ⌘⇧Y in `note-tags.tsx`. ⌘⇧T is the reopen shortcut on every platform and nothing else in the app has a claim that strong; tags keep the status strip and the palette, which is what `D31` allows.

### D53 One workspace route, and a live editor per open tab

`src/routes/index.tsx` is the only screen. It renders the strip, every open tab's session, and the two bands. `src/lib/tabs/store.ts` owns the open set and which tab is active; `src/lib/tabs/tab.ts` holds the list algebra and its spec. Every open tab keeps its editor mounted and hidden rather than unmounted, so undo, selection, caret and scroll survive a switch and nothing re-parses. Content is read by the session, not by a route loader.

`/notes/$` and `/external` are gone. A splat holding one note path stopped describing what is on screen the moment two notes could be open, and with external files as tabs (`D54`) there was no path shape covering both.

**Rejected: remounting on every switch and restoring the caret.** The smaller change, keeping `<NoteEditor key={path}>` and the single live buffer, with the caret carried through the sentinel machinery `toggleSource` already uses. Rejected because undo history cannot be carried that way: type in one note, check another, come back, and ⌘Z does nothing. Re-parsing a long note on every switch also puts a hitch in the one interaction tabs exist to make cheap.

**Rejected: holding the tab set in the URL.** One source of truth, loaders and invalidation for free, and no store to write. Rejected because the window has no URL bar, so nothing is gained in exchange for encoding a list of absolute host paths into a search param and rewriting it on every open, close and rename.

**Rejected: keeping the open set in `settings.json`.** The documented preference channel, written by Rust through `tauri-plugin-store`. Rejected because the open set is window state rather than a preference: it belongs to one machine's session, it changes on every tab someone opens, and `settings.json` is a file a person may read. It lives in `localStorage` beside the writing-mode toggles in `src/lib/prefs.ts`.

**Constraint:** nothing inside a session may register a window listener or a hotkey. Several are alive at once, so a per-session listener fires N times: the drag-drop handler would copy one dropped file into every open note. The drag-drop listener, ⌘P and ⌘D live in the workspace and act on the active tab, and the writing-mode toggles moved out of the session for the same reason.

### D54 An external file is a tab, over one session and one autosave chain

"Open With" opens every queued path as its own tab. A `Tab` is `{kind: "external" | "note", path}`, and the kind picks the read and the write and whether the note actions apply. `useAutosave` takes the write as an argument instead of reaching for `saveNote`.

`external.tsx` was a second hand-rolled copy of the 800ms serialized write chain, kept in step with `use-autosave.ts` by hand, which `D31` forbids. It existed because an external file had nowhere to live beside a note. Rust already queued every path `pending_open_files` returns, and the UI dropped all but the first and apologised with a toast. Both were the same missing thing.

**Rejected: a second window per external file.** Real separation, and `D20` already runs quick capture that way. Rejected because a second window means a second router, a second palette and a second quit handshake, which `D20` accepted for a capture box holding no library state and would not be worth for a file someone is editing.

**Constraint:** an external tab carries no frontmatter state, so it reports no pin and no tags rather than a second shape, and the pin and the tag row are absent from the chrome while it is active.

### D55 A kind on `FileError`, and a Rust error that carries it

`read_note` and `read_external` classify `io::ErrorKind::NotFound` as `not-found` and everything else as `failed`, on a `CommandError` struct that replaces `Result<T, String>` across the commands behind the `FileStore` port. `FileError` grows a matching `kind`, and `NoteSession` treats only `not-found` as a deletion.

Every failure used to flatten to one string, so a tab could not tell a note someone deleted from a read that failed for a second. It called both a deletion: it showed "this file is gone", stopped writing to disk for good, and closed itself if the buffer happened to be clean. A permission change or an unmounted folder lost the tab.

**Rejected: a second tagged error beside `FileError`.** The idiomatic Effect shape, and the one `ARCHITECTURE.md` implies by saying errors are `Schema.TaggedError`. Rejected because `FileError` is the failure type of all 13 members of the `FileStore` port and all 9 of `NoteService`, so a second tag turns 22 signatures into unions to carry one bit that every caller but one ignores.

**Constraint:** `db_select` keeps `Result<T, String>`. It belongs to the `Database` port and fails as `DatabaseError`, which services turn into defects, so a kind on it would never be read.

### D56 A tab's identity is a minted id, not its path

`Tab` carries an opaque `id`, minted in `store.ts` when the tab opens, and `tabId` returns it. A rename rewrites `path` in place and leaves the id alone, so the `NoteSession` the workspace keys on it is not remounted. Opening, reopening and renaming find a tab by kind and path rather than by rebuilding its id.

The id used to be `${kind}:${path}`, so a retitle or a folder move changed it. React saw a new key and threw the session away: undo history, the caret, the scroll position and the autosave chain, on a note the user was editing. The same change dropped the tab's snapshot, orphaned its restored caret, and left the reopen stack holding a path that no longer existed.

**Rejected: keeping path identity and migrating the store's side-tables on rename.** A smaller diff, no persistence change, and no migration to get wrong. Rejected because it cannot fix the remount, which is the part that loses the user's work: React keys off the id, and the id is what the rename changes. Moving the snapshot and caret across would leave the editor rebuilt underneath them.

**Constraint:** an id can no longer be derived from a path, so "the tab holding this file" is a lookup. A store written before this carries no ids and keys its carets by `kind:path`, which `restoreTabs` migrates on the one launch that reads it, minting there rather than in `parseTabs` so a path-shaped id never reaches the DOM.

### D57 Attachment destinations are encoded with mdurl

`src/lib/utils/attachments.ts` and `bareDestination` call `encode` and `decode` from `mdurl`, markdown-it's URL helper, rather than `encodeURIComponent`. The write side excludes `/` plus the unreserved set, the read side excludes nothing, and the serializer takes the URL syntax as its default.

`decodeURIComponent` throws on a stray `%`, so a `try`/`catch` around a segment hands back one still carrying `%20`, naming a file that does not exist. mdurl decodes escape runs byte by byte, and `keepEscaped` makes encoding idempotent.

**Rejected: decoding per escape run with no dependency.** Three lines, and it closes the same gap and no other, leaving the serializer's escape hand-rolled beside it and every character class a re-reading of the CommonMark spec.

**Constraint:** `encode.defaultChars` cannot exclude non-ASCII, so `[a](https://ex.com/café)` is rewritten to `caf%C3%A9` on the next save.

### D58 An image is inline, and notras owns the paragraph token

`NoteImage` is configured `inline: true`, and `NoteParagraph` keeps the paragraph around an image alone in one, so every position a markdown image can take produces a doc the schema accepts.

TipTap ships the image as a block while markdown makes it inline, so one sharing a line with anything else landed in a paragraph that could not hold it and the first `contentMatchAt` threw into the route error boundary. Upstream's paragraph handler unwraps a lone image to keep its own block at doc level, which is why `inline: true` alone moves the invalid case rather than closing it.

**Rejected: repairing the parsed JSON at the entry points.** It leaves the image a block, and cannot reach the `content` TipTap parses when the editor mounts.

**Constraint:** owning the token for parsing means owning it for rendering, since the render path resolves a node through the parse registry first. A lone image is a paragraph in the doc rather than a top-level node.

### D59 The code mark excludes nothing

`NoteCode` replaces TipTap's `excludes: "_"` with `""`, so a text node may carry `code` alongside `bold`, `italic`, `strike` or `link`.

Markdown writes all four and the parser builds them, the schema rejected the result, and the invalid doc threw into the route error boundary on the first read. Two forms were worse than the crash: ``*`x`*`` and ``~~`x`~~`` serialized their markers inside the backticks, editing the file. `code` is the only mark in the stack that declares `excludes`, so this is the whole class.

**Rejected: dropping the conflicting mark while parsing.** It needs no schema change, and loses what the file says: ``**`x`**`` would save back as `` `x` ``, editing a note on open.

**Constraint:** markdown cannot express bold over part of a span, so that saves as `` `**hello** world` ``, literal markers inside it.

### D60 A tab drag is dnd-kit's, and reorders on release

`TabStrip` wraps the tablist in dnd-kit's `DndContext` and `SortableContext`, each `TabItem` calls `useSortable`, and `moveTab` runs once from `onDragEnd`. The strip used to hand-roll the drag on pointer events and call `moveTab` on every crossing, so the tab teleported into its new slot and each crossing re-rendered the workspace and rewrote `localStorage` mid-press.

**Rejected: keeping the hand-rolled drag and adding a FLIP pass to it.** About 300 lines against 45, and its one advantage was a pure index-math function with a spec, where dnd-kit's equivalent needs a layout engine `happy-dom` does not have.

**Rejected: every library built on the HTML5 drag-and-drop API,** `@atlaskit/pragmatic-drag-and-drop` foremost. `tauri.conf.json` sets `dragDropEnabled`, which turns DOM drag-drop off and is what lets `onDragDropEvent` take a file dropped into a note. dnd-kit's `PointerSensor` needs neither. Also rejected: `@dnd-kit/react` 0.5.0 (beta), `motion`'s `Reorder` (spring-first), `sortablejs` (moves nodes itself, against `D56`'s keys).

**Constraint:** `useSortable`'s `attributes` are not spread and no keyboard sensor is installed, because they carry a `role` and `tabIndex` that would overwrite what `D37` set. The drag handle is the label button, so the close button beside it does not start a drag.

**Constraint:** the tablist is `relative` and the overflow measure reads `offsetLeft` against it. A transformed tab has a rect outside its slot, and the measure would count it as scrolled out of view for the length of a slide.

**Constraint:** `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0 were last published in December 2024 and the successor is the beta above, so this is a dependency that will not move.

**Constraint:** one tab has nowhere to go, so `useSortable` takes `disabled: sole` and the tab carries `data-tauri-drag-region` instead. dnd-kit drops its listeners when disabled, and Tauri's injected handler treats a `button` that carries the attribute as a drag region, so the press moves the window the way the rest of the titlebar does. That reverses `D28`'s no-drag exemption for one element under one condition. It also means the sole tab inherits macOS titlebar behaviour whole: a double-click on it zooms the window, and Tauri's `preventDefault` on the mousedown leaves the button unfocused after a click.

### D61 `SPEC.md` states behaviour, and `DEFERRED.md` holds what was ruled out

`SPEC.md` carried a 34-box walkthrough run under `pnpm dev`, 16 checked and 18 open, plus a list of work nobody had picked up. Every box described real behaviour in the shape of a to-do item, so a checked box logged what the change that added it had already verified, and an open one recorded an intention. The same file was answering what the app does and what nobody has done. `SPEC.md` now states what the app does, as claims a reader can check against a running build, and `DEFERRED.md` carries the ruled-out work under an entry bar of its own.

**Rejected: keeping the 18 open boxes as a checklist.** They name behaviour nobody has walked end to end, mostly the tab work in `D52` through `D56`. Rejected because a checklist that only grows a tail of unwalked boxes tracks a backlog, and an issue tracks a backlog better. The behaviour each box described is stated in `SPEC.md` instead, where it holds whether or not anyone has walked it lately.

**Rejected: keeping the two lists in one file.** Fewer files, and the split costs a doc-map row. Rejected because the two answer different questions, and the file that mixed them read as a backlog, which is how the walkthrough's tail grew to 18 in the first place.

**Constraint:** `D21` says window behaviour has no automated coverage, and it now has no written walkthrough either. `AGENTS.md` asks for a `pnpm dev` pass on any Rust or window change, and `SPEC.md`'s claims for that area are what to exercise.

### D62 One line per paragraph, and nothing hard-wraps

Every doc here was hard-wrapped at roughly 80 columns. Markdown is rendered rather than read raw, so the wrap changed nothing a reader sees while making a one-word edit rewrap every line under it, which is what turned a word into a paragraph-sized hunk in review. Prose now runs to the end of its paragraph and the editor soft-wraps it. `AGENTS.md` carries the rule.

**Rejected: keeping the hard wrap.** The plain-text convention, older than this repo and what every doc used. Rejected on what it buys: a fixed column serves a reader looking at raw text, and nobody reads these raw. `AGENTS.md` had already banned the wrap in PR bodies, so the repo held both rules at once.

**Rejected: one sentence per line.** Finer diffs, since an edit lands on the sentence rather than the paragraph, and it renders the same. Rejected because GitHub turns each newline in a PR body into a line break, so it cannot be the rule in both places, and one rule covering both is worth more than the finer diff.

**Constraint:** nothing checks this. Ultracite does not format markdown and `D15` and `D41` rule out Prettier, so the rule in `AGENTS.md` and a reader are what hold it.

### D63 Typewriter scrolling replaces the editor's own scroll

The typewriter recentre rides ProseMirror's `handleScrollToSelection`, so while the mode is on it replaces the built-in nearest-edge scroll instead of correcting after it, and one writer owns the scroller. A transaction recentres when it changed the document or moved the selection without the pointer meta: typing, deletion, undo, paste, and keyboard caret travel, but not a click, a drag-selection, or the mount-time caret restore, which opts out through a meta of its own. The note is padded below by half the scroller's height and not above, so the caret types at its natural height until its line reaches centre and locks there, the last lines still reach centre, scrolling up settles at the note start, and a toggle cannot shift the text. A window resize re-measures the padding and recentres through the same path. The replacement covers the note's vertical scroller alone, so horizontal visibility inside an inner scroller, a code block's own overflow, keeps ProseMirror's instant nearest-edge nudge. The recentre glides over 0.15s, collapses to instant under `prefers-reduced-motion`, and yields the moment anything else moves the scroller. The note's scrollbar is hidden while the mode is on: a bar flashing on every recentre is noise against a line that holds still, and the bottom padding skews its geometry anyway.

**Rejected: correcting the scroll after ProseMirror's own,** which is what shipped: a `scrollTop` write in `onSelectionUpdate` landed on top of the nearest-edge scroll on every selection change, clicks and drag-selections included, and clamped at both ends of the note for want of padding.

**Rejected: recentring on mouse clicks and drag-selection.** iA Writer recentres on click. A click here is navigation rather than writing, and a recentre on mousedown moves the text under a drag-selection mid-gesture.

**Rejected: padding the top so the first line can centre,** which is iA Writer's shape and what this change first tried. The padding is reachable scroll range, so scrolling up to read opened half a viewport of blank above the note start instead of settling at its bounds. The maintained Obsidian typewriter plugin names the alternative "only maintain typewriter offset when reached" and pads only the bottom in that mode; the scroll clamp at the top is what implements the reached threshold.

**Rejected: native `scrollTo({behavior: "smooth"})`.** WKWebView fixes the duration, and a call cannot retarget the animation mid-flight, which a fast typist does on every keystroke.

**Rejected: CSS `container-type: size` with `cqh` padding.** Size containment makes the scroller the containing block for `position: fixed` descendants, and the link editor is one, positioned with viewport coordinates from inside the scroller.

### D64 Scrolling lifts focus mode's dim

Focus mode dims every block but the caret's, which makes the rest of the note unreadable the moment the person stops writing to reread it. A wheel or touch scroll now lifts the dim, and the next caret engagement, typing, arrow travel, or a click, restores it. The lift is a second class beside `focus-mode-on` that overrides opacity while the base rule stays matched, which keeps the 0.3s transition on the element so both directions fade. Adopted from the maintained Obsidian typewriter plugin's pause-dim-while-scrolling, which defaults on there and is always on here.

**Rejected: keying off the `scroll` event.** It also fires for the typewriter glide and ProseMirror's own nearest-edge scroll, which move the scroller on every keystroke, so the dim would lift at the one moment it must hold.

**Rejected: a preference for it.** Scrolling is reading and a dimmed note cannot be read; no case for holding the dim mid-scroll was named.

**Constraint:** a scrollbar drag and a paging key fire neither `wheel` nor `touchmove`, so they scroll with the dim held. The upstream plugin accepts the same gap.

### D65 Renovate moves the tauri npm and crate halves together

Tauri ships each package as an npm and crate pair, and `tauri build` errors when the two differ in major or minor, a check reachable nowhere else: `tauri dev` only logs it and `tauri info` prints it and exits 0. `cargo update` moved `tauri-plugin-updater` to 2.11.0 under the `"2"` range in `Cargo.toml` while `package.json` held its exact pin at 2.10.1, which passed every job in `ci.yml`, reached the v0.2.1 tag, and failed all three bundle legs in under two seconds. The condition was that npm deps moved under an interactive `npm-check-updates` and crates moved under a separate `cargo update`, so nothing made a pair move together. Renovate resolves each dependency to its source repository and `matchSourceUrls` matches across managers, so one rule naming `tauri-apps/tauri` and `tauri-apps/plugins-workspace` puts both halves of every pair in one pull request. `deps:up` and `actions:up` are gone with it, since Renovate is what runs them now.

**Rejected: a repo script comparing `package.json` against `Cargo.lock` in `ci.yml`.** It was built and it worked, and it detects the drift while leaving the two-tool bump path that produces it standing. Tauri's own guidance is to keep the versions synced rather than to check them afterward, and every fix here would still have arrived as a pull request that failed rather than one that was correct.

**Rejected: `config:best-practices`.** It extends `:maintainLockFilesWeekly`, and a weekly `cargo update` against a `"2"` range moves a crate minor while an exact npm pin cannot follow, which schedules this bug rather than preventing it.

**Constraint:** `minimumReleaseAge` is 3 days, above pnpm's own 1440-minute default, because the crate and the npm package publish seconds apart and a poll landing between them would open a cargo-only pull request that drifts the pair again.

**Constraint:** Renovate's `lib/data/monorepo.json` carries `tauri` but no `plugins-workspace`, so `group:tauriMonorepo` covers the core pairs and the plugin rule here is a local stand-in for an entry that belongs upstream. It goes stale if Renovate adds one.

**Constraint:** nothing in CI runs the Tauri CLI, so a pair that drifts anyway is caught by `tauri build` on the release tag. `tauri build --ignore-version-mismatches` exists and does not belong in `release.yml`.

### D66 TanStack Query caches the reads, and the change event names what to invalidate

Every read goes through TanStack Query. `src/data/queries.ts` holds one `noteQueries` factory whose keys run generic to specific, so each invalidation the app makes is a single prefix: `["notes"]` for an event that named no paths, `["notes", "index"]` for what the note rows derive, and `["notes", "file", kind, path]` for one tab. `notesDirQuery` sits outside that tree, because the notes folder is settings and no write to a note can move it. The root loader primes the cache and returns nothing, components read through `useSuspenseQuery`, and a tab's file is a `useQuery` that replaced `NoteSession`'s own state, its read effect, and its newest-wins counter. `router.invalidate()` is gone, and so are `subscribeRevision` and `bumpRevision` in `src/lib/tabs/store.ts`.

`write_note` emits `notes-changed` on every save and autosave debounces at 800ms, so typing ran four IPC and SQL round trips and made every mounted tab re-read its file from disk, once per 800ms, for a change that named one file. The event has carried its `paths` since it was written and the webview threw them away.

**Rejected: routing the payload through a hand-rolled readers map.** It was designed in full: `subscribeRevision` keyed by path, `bumpRevision` taking the changed set, and an empty set meaning the whole vault. It adds no dependency and it is a partial version of what a keyed cache already does, leaving the newest-wins counters in `note-session.tsx` and `command-palette.tsx` standing because the reads stay unkeyed.

**Rejected: `@effect-atom/atom-react`.** The option that composes with the Effect layer the rest of the app runs on. Version 0.7.0 peer-depends on `effect: ^3.22.1` and this repo pins `effect@4.0.0-rc.112`, so taking it means a peer override on a 0.x library against a release candidate of its own peer.

**Rejected: keeping the whole-folder fan-out.** One signal and no matching rule, and a tab picks up a frontmatter change even when its own path went unreported. Rejected because typing drives the event, so the cost scales with the number of open tabs while someone writes.

**Rejected: suppressing the event for the app's own write.** It would remove the loader invalidation with it. Quick capture is a second webview writing through the same command (`D20`), and the main window learns of that write from this event and nothing else.

**Rejected: the global `QueryCache` error toast.** TanStack's own guidance guards it with `query.state.data !== undefined`, so only a failed background update reports. That guard silences a first read failing for any reason other than a missing file, which `SPEC.md` requires a toast for.

**Constraint:** an empty `paths` means the whole vault changed. `set_notes_dir` emits one, `reindex_all` emits one for a vault that scanned back empty, and the watcher never emits empty at all. An emit site added later that cannot name what changed emits empty rather than nothing.

**Constraint:** `useLoaderData` is not used for query data. A query read that way never becomes active, which makes it eligible for garbage collection and puts it beyond the reach of invalidation.

**Constraint:** the router's own cache is off through `defaultPreloadStaleTime: 0`, so one cache owns staleness.

**Constraint:** `staleTime` is infinite and `retry` is off. The watcher reports an external write within about a second (`D16`), so staleness here is an event rather than a duration, and three retries with backoff would delay the missing-file failure that closes a deleted note's tab.

**Constraint:** a tab holds its last successful read in a ref and falls back to it. A rename changes the key and a failed read clears the data, and either one would otherwise empty the buffer and remount the editor, which is the loss `D56` exists to prevent and the text `D55` promises to keep. Query's own `placeholderData` covers the pending case alone, because it is gated on a status of `pending` and a key that errors reports `error`.

**Constraint:** an external tab's `refetchOnWindowFocus` is `"always"`, not `true`. `shouldFetchOn` reads `value === "always" || (value !== false && isStale(query, options))`, so under an infinite `staleTime` a plain `true` asks a staleness question the query can never answer yes to, and the one refresh path an external tab has would never fire.

**Constraint:** the `/` loader's launch seed is the one read that stays a direct call. It asks for the most recently updated note once per launch to decide which tab opens, and caching a single-row answer nobody reads again would put a key in the cache to serve a decision already made.

**Constraint:** a disabled query still reads its cache entry. A key standing for "nothing to ask" must not collide with one that holds data, which is why the palette returns its own recent slice rather than whatever `enabled: false` handed back.

**Constraint:** an external tab refetches on window focus. Its path lies outside the notes dir, so no payload will ever name it and invalidation cannot reach it.

### D67 A mutation scope serializes a note's tag writes

`useNoteTags` writes through `useMutation` carrying `scope: { id: path }` and `mutationKey: ["note-tags", path]`. The promise queue, the request counter, and the ref holding the last set known to be on disk are gone. `mutationCache.canRun` starts a mutation only when it is the first pending one in its scope, so the scope is what makes the last call the last write. The optimistic list stays in the hook, adjusted during render against the tags coming back from disk.

The queue it replaces belonged to the hook instance, and `D31` puts tag editing on two surfaces. The status strip and the palette therefore held separate queues and did not serialize against each other at all, which the scope fixes by keying on the note instead.

**Rejected: reading the displayed value from `mutation.variables`.** It deletes the optimistic list outright. Rejected because the value stops being pending the moment the write resolves, while the truth arrives a full IPC round trip later through `notes-changed` and the re-read, so the row flashes back to the old set and forward again. That is the failure that ruled out `useOptimistic` in `D66`.

**Rejected: patching the cache in `onMutate`,** which is the canonical optimistic shape and would remove the local list honestly. Rejected on reach: tags render from `noteQueries.file` and from every `noteQueries.list` variant the palette holds, so one toggle would have to find and rewrite the note inside each cached list.

**Rejected: converting `useAutosave` the same way.** Attempted and abandoned. Its unmount flush has to carry a buffer left behind by a failed write, which no library holding the pending arguments itself can hand back. `dirty` also has no `MutationStatus`, because it describes the buffer rather than a request. `D68` later moved the timer alone and left the buffer here.

**Rejected: a mutation for the launch-at-login switch.** Built and reverted. `onMutate`, `onSettled`, a scope, and a wrapper for the second argument Base UI passes its change handler came to 22 lines against the 11-line `try`/`catch` they replaced. The read moved to a query and stayed there; the write did not.

**Constraint:** a rollback asks `isMutating({ mutationKey })` rather than counting requests itself. `onError` runs before the failure is dispatched, so the failing mutation still counts as pending, and a total above one means a later toggle is queued behind it. `D31` requires that superseded failure to leave the display alone.

**Constraint:** the optimistic list stays in the hook. It is what covers the gap between a write resolving and the re-read landing, which no mutation state spans.

### D68 Pacer runs every debounce, and owns the autosave timer alone

`@tanstack/react-pacer` replaces `use-debounce` at the palette's 150ms search and the code block's 1500ms copy label, and replaces the `setTimeout` and `timerRef` that `use-autosave.ts` had rolled by hand. All three read the same defaults: `leading: false`, `trailing: true`.

`useAutosave` gives up the timer and nothing else. `chainWrite` now holds the serialization that `flush` used to, `useDebouncer` sits between the two, and `flush` cancels a scheduled write before consuming the buffer rather than cancelling it once the write starts. The buffer, the disk gate, and the status machine did not move.

**Rejected: keeping `use-debounce`.** Stable at 10.1.1 and 122KB unpacked, against a package at 0.23.0 that brings `@tanstack/pacer`, `@tanstack/react-store`, and `use-sync-external-store` with it. Rejected because it covered two of the three debounces and left the third hand-rolled beside it, in a frontend already standing on TanStack Router and Query. The version is the cost: 0.x means a minor can break the API.

**Rejected: `useAsyncDebouncer` for the whole of `useAutosave`.** It runs overlapping executions in parallel rather than serializing them, and clears `lastArgs` in a `finally` when the written function rejects, so a failed write's content would be gone and `flush()` would have nothing left to retry. Both are properties this hook exists to hold.

**Rejected: Pacer's `enabled` option for the disk gate.** It gates scheduling, where the gate belongs at the write. Recording has to continue while the file is gone, or a later flush sends the snapshot from before it went over everything typed since.

**Constraint:** no `selector` is passed. `useDebouncer` subscribes to its store either way, and the default selector returns a fresh `{}` compared with `shallow`, so nothing re-renders. A selector here would re-render a note on every keystroke.

**Constraint:** the `useLayoutEffect` refreshing `pathRef` and `optionsRef` stays. Pacer's timer is still a `setTimeout` macrotask, so the gap between a commit turning `enabled` off and a passive effect running is the same one it always was.

**Constraint:** the lockfile carries `@tanstack/store` twice, at 0.9.3 for Router and 0.11.1 for Pacer. `pnpm dedupe` does not collapse them. The second copy costs 2.03 kB gzipped, measured against the same build without Pacer, and an override pinning Router to 0.11.1 is untested across a 0.x minor.

### D69 TanStack Hotkeys types the bindings, and its defaults replace the options object

`@tanstack/react-hotkeys` replaces `react-hotkeys-hook` across the registrations in `__root.tsx`, `index.tsx`, `capture-window.tsx`, and `note-tags.tsx`. Every binding is now a member of the `Hotkey` template-literal type, which fixes modifier order as Control, Alt, Shift, Meta and spells keys as `KeyboardEvent.key`, so `alt+mod+left` is written `Mod+Alt+ArrowLeft` and `esc` is written `Escape`. A mistyped chord fails `pnpm typecheck` instead of silently never firing.

The four copies of `HOTKEY_OPTIONS` are deleted and nothing replaces them. `preventDefault: true` is already the default, and `getDefaultIgnoreInputs` returns false, meaning fire inside inputs and contentEditable, for any hotkey carrying `ctrl` or `meta` and for `Escape`. That covers every binding the app registers, so the smart default reproduces `enableOnContentEditable` and `enableOnFormTags` rather than restating them.

The three comma-separated bindings become `useHotkeys` arrays with one callback per chord, so `jumpToTab` takes an index, `cycleTab` a direction, and `carryTab` an offset. `Number(event.key)`, `event.shiftKey`, and `event.key === "ArrowLeft"` are gone with them, and the ninth-versus-last branch collapses into the `-1` row of `TAB_JUMPS` reaching `tabs.at`.

**Rejected: keeping `react-hotkeys-hook`.** Stable at 5.3.3, published 2026-06-26, with 4.35M weekly downloads and no runtime dependencies, against an alpha at 0.10.0 published 2026-04-25 with 642k. Rejected because its bindings are plain strings, where `mod+comma` and a typo are equally valid to the compiler, and because the options object it needed was copied into four files to restate a default the replacement already holds.

**Rejected: a `HotkeysProvider` carrying those defaults.** One mount above the capture-window branch in `app-shell.tsx` would reach both windows, so it is cheap. It was rejected because it centralizes the four copies rather than deleting them: with `ignoreInputs` and `preventDefault` already right, the provider would carry an empty object.

**Constraint:** alpha at 0.10.0, so a minor can break the API. The same cost `D68` took at 0.23.0.

**Constraint:** `stopPropagation` now defaults to `true`, where `react-hotkeys-hook` never called it. Nothing in the app listens for a stopped keydown: the only `window.addEventListener` is `blur` in `use-autosave.ts`, and React, ProseMirror, and the roving tablist in `tab-strip.tsx` all handle keys below `document` and so run first.

**Constraint:** the swap costs 382 bytes gzipped across the two JS chunks, measured by building the same tree both ways (`index` +421, `routes` -39; the CSS and fonts do not move). `@tanstack/hotkeys` is the only package added, because `@tanstack/react-store` and `@tanstack/store` were already in the lockfile at 0.11.1 for Pacer.

### D70 TanStack Store backs the window stores, and snapshots split off the open set

`@tanstack/react-store` replaces the hand-rolled `useSyncExternalStore` plumbing in `src/lib/prefs.ts` and `src/lib/tabs/store.ts`. Both files held the same shape: a mutable module value, a `Set` of listeners, a `subscribe` closure, and an `emit` loop. `createStore` and `useSelector` stand in their place, and the two listener sets go with their `useCallback`-wrapped getters. Every export keeps its name and signature, so no call site changes and `src/lib/tabs/store.spec.ts` passes untouched.

The tab module splits into two stores. `tabs` holds the open set and the active id, and `snapshots` holds what each session publishes for the chrome to draw. One `emit()` used to wake every listener, so a keystroke republishing a snapshot ran the getter and an `Object.is` for each reader of the open set before all of them bailed. Split, a keystroke reaches only the snapshot readers.

`closed`, `restored`, and `handles` stay plain module state. Nothing subscribes to them, and `registerTabHandles` notifies nobody by design, which moving them into a store would undo.

**Rejected: keeping `useSyncExternalStore`.** A React built-in that cannot break, against a package badged alpha at 0.11.1 that shipped two breaking changes in six months: 0.9 removed `Derived` and `Effect`, and 0.11 deprecated `useStore` in favour of `useSelector`. Rejected because the version is pinned exactly, so a breaking minor arrives when someone bumps it and `pnpm typecheck` fails the build rather than the tab set. The same 0.x cost `D68` and `D69` took.

**Rejected: zustand or jotai.** Both are stable majors where Store is alpha. Rejected because each adds a runtime dependency to a tree that already carries `@tanstack/store` twice, to wrap the same `useSyncExternalStore`.

**Rejected: one store per tab, held in a `Map`.** It narrows a snapshot notification to the tab that changed rather than to every snapshot reader. Rejected because it needs a lazily created registry that `useTabSnapshot` can read during render for a tab that has published nothing yet, and a selector over one record already bails on the same reference check.

**Constraint:** persistence is a subscription in `prefs.ts` and an explicit `persistTabs()` call in `tabs/store.ts`. `restoreTabs` writes the set without persisting, and a subscription would fire there too, reading carets off sessions that have not mounted and writing an empty set over the one just read.

**Constraint:** no `compare` is passed to `useSelector`. The default is `Object.is`, and `publishTabSnapshot` stores the object the session hands it, so a tab nobody touched returns the same reference and bails. `shallow` here would re-render every session on every keystroke, the trap `D68` recorded for Pacer.

**Constraint:** the swap costs 84 bytes gzipped, measured by building the same tree both ways (`index` +84; `routes`, the CSS and the fonts do not move). No package is added to the lockfile: `@tanstack/react-store` was already resolved at 0.11.1 for Pacer and Hotkeys, and the direct dependency pins that copy.

### D71 The selection is what a move acts on

`⌥↑`, `⌥↓` and a drag all move the same thing: the blocks the selection covers, widened to whole siblings by `blockRange` and out to the whole item when the caret sits in a list. `move-selection.ts` decides that and builds the transaction, `drag-selection.ts` supplies only the pointer. The reading surface gains nothing at rest.

**Rejected: a grip in each block's gutter,** which is what Notion, Slack canvas and Tiptap's own extension do. It was built and abandoned twice. A heading and its body is not a node, so a grip could only ever move one block and "move this section" was unreachable by construction. Worse, it had to guess which block was meant from the pointer's x and y, against a surface whose left column already holds markers, checkboxes and a quote bar, so the collisions and the jank were the same fault wearing two faces. Notion escapes this only because it draws its bullets inside the block, leaving the column free; `D40` keeps typeset's markers outside, so that column is taken.

**Rejected: `@tiptap/extension-drag-handle-react`.** It sets `draggable` and listens for `dragstart` and `drop`, and `dragDropEnabled` suppresses DOM drag-drop, which `D60` already found. It also hard-imports `@tiptap/extension-collaboration` and `@tiptap/y-tiptap`, so its documented install is five packages including `yjs`, none of which `src/` would import.

**Rejected: a "select section" command.** Selecting a heading and its body by hand already works, so nothing is blocked and `DEFERRED.md` gets no entry.

**Reversed: the blocks do follow the pointer,** the way a dragged tab does (`D60`). Dimming them in place behind a line was tried first and drew less, but it left nothing moving with the cursor and, because the drag starts on text rather than on a handle, no cursor change either: the pointer stayed an I-beam for the whole gesture. A copy now follows under the tab drag's shadow and the cursor reads as grabbing.

**Refined: the copy sits below and right of the pointer rather than under the grab point.** Anchored where it was grabbed it covered the pointer, and with it the bar marking the drop; for words the copy's own text sat over the bar. Native macOS drags keep the image under the grab point, so this trades that convention for a mark that stays in view. Rejected: drawing the bar as a fixed overlay above the copy, which has to re-read coordinates on every scroll and pointer move rather than sitting in the flow. Rejected: a translucent copy, which left the bar dim under the copy's own text.

**Reversed: the mark is a bar at the drop point, not a line under the block.** A `--primary` line 2px tall drew between blocks first. One mark now serves both kinds of drop: a bar 2px wide and `1em` tall standing between characters for words, and at the start of the first line of the block it lands before for blocks, which is where the content will begin rather than the gap below the block above. It is the drop cursor CodeMirror draws and Obsidian ships. Where nothing there holds text the bar hangs below the block above as a zero-height widget, since an inline box between blocks would take a line of its own and shift the note under the pointer.

**Refined: the drag claims every selection, and what it moves follows the highlight.** A selection covering a block end to end or crossing into another moves blocks. One inside a block moves the words alone and lands them at a text position, the way CodeMirror's native drag does in Obsidian. Widening two selected words to their paragraph moved more than the highlight promised, and left no way to drag the words at all. Moving the decision to the selection also removed the triple click special case: the third click lands in a partial selection, so ProseMirror selects the block itself. Rejected: leaving a word selection to ProseMirror's own drag. `dragDropEnabled` answers every DOM drag before WebKit sees it (`D60`), so that press dragged nothing.

**Constraint:** a pointer move needs a selection first, which is the bargain native text drag already makes. Pressing inside one is not an unclaimed gesture, though: ProseMirror's `dragstart` handler would drag the selected slice, and `LeftMouseDown`'s `mightDrag` is a separate mechanism for draggable nodes. Neither runs here, since `dragDropEnabled` keeps every DOM drag from the page, so the pointer path is the only drag the editor has and StarterKit's drop cursor is off.

**Constraint:** a pointer move carries `pointer` meta, so `D63`'s typewriter leaves the scroll alone and the note does not lurch under a drop. A keyboard move carries none and recentres like any other keyboard travel.

**Constraint:** `⌥↑` and `⌥↓` displace macOS's paragraph jump inside the editor. They are VS Code's move-line-up/down, and a TipTap keymap rather than an app hotkey because several sessions are alive at once and only the focused editor may answer (`D53`).

**Constraint:** a keyboard move carries the selection and a block drag collapses it to a caret, because a drag's selection is only what it took hold of and reads as a stray highlight once the block has landed. A text drop keeps the dropped words selected instead: that highlight covers exactly what moved, and it is what the browser, ProseMirror and CodeMirror leave behind. Rejected: replacing the selection with one covering the moved range, which renders as a ragged band the moment it crosses table cells. A table row collapses either way: the row is the unit whatever was selected, so a carried selection preserves nothing, and a cross-cell one is a `CellSelection` that would come back as a ragged text band rather than the clean tint it started as.

**Constraint:** a table's unit is the row, and a row never leaves its table. Nothing finer moves, because a cell's paragraph is a block like any other and moving one emptied the cell and dropped its text into the body. The header row is fixed and nothing passes above it, since markdown writes the first row as the header.

### D72 The link index is a graph table, and a note's inbound links are its mentions

`note_link` holds one row per `[[wikilink]]` occurrence: the note, the line as `grep -n` counts it, a `kind`, the text between the brackets as written, and the line itself. Rust writes it in the same transaction as the note's other rows, TypeScript resolves the targets on read through the one resolver in `src/core/links.ts`, and the status strip shows the result as `3 mentions`. `DEFERRED.md` had ruled backlinks out because nothing recorded which note links to which, and the owner wanted the table shaped for a graph rather than for the minimum backlinks need, so the shape was read off the projects that already store one.

Prior art read at source: zk keeps `source_id, target_id NULL, href, type, snippet, snippet_start, snippet_end` per occurrence; org-roam keeps `pos, source, dest, type, properties` with `dest` never validated; SilverBullet keeps `page, pos, type, snippet, alias` per occurrence; basic-memory keeps `from_id, to_id NULL, to_name, relation_type, context` and resolves forward references later; vault-graph and foam-notes-mcp type their edges and ship placeholder tools for unresolved targets; Obsidian's `MetadataCache` is the one per-pair store, and it is an in-memory cache. GraphRAG ties each relationship to its `text_unit_ids` and Graphiti to its episodes, so provenance per edge is what the AI-side stores keep too. Three conclusions followed: a row is an occurrence, the target is the text as written with unresolved as a state rather than an error, and edges carry a kind.

**Rejected: one row per pair of notes with a count,** which is Obsidian's cache. It cannot say which sentence referenced a note, and it cannot be turned back into occurrences without a rebuild.

**Rejected: storing the resolved target path at index time.** Under the mtime skip a note created or retitled later leaves every row that named it stale, and an unedited note is never re-indexed. zk and basic-memory carry a repair pass for that; resolving on read needs none. Rust stores the text trimmed and otherwise verbatim, so lowercasing happens in one language.

**Rejected: resolving in SQL.** It duplicates the title-then-stem tie-break of `D32` in a second language, and the whole note list is already in memory for the palette.

**Rejected: a hand-rolled scanner for what is code.** The editor's parser was probed with every case before the Rust was written. It treats indented code list-aware, hides HTML blocks and comments, hides text between a matching pair of inline tags while an unmatched tag hides only itself, tokenizes image alt text, and takes `[[**a**]]` whole. That is a CommonMark block parser's job, so pulldown-cmark decides the blocks and a byte mask over the body carries the rest. Hand-rolling it meant re-deriving those rules, which is where the two sides would have drifted.

**Rejected: the foot of the note for the surface,** which Roam and Bear use, and a palette-only list. The foot is seen only when scrolled to the end and needs typewriter and focus-mode work; the palette hides the fact until asked. The strip is always visible, sits outside the scroller, and already opens a popover from the tag picker. Notion's line under the page title was rejected because the note surface has no title anchor: a line above the first block would sit above the user's own `#` heading.

**Rejected: "backlinks" as the word,** along with `3 notes link here` and `3 links here`. "Backlink" names the mechanism and travels only with people who used Roam, Obsidian or Notion, while "mentions" is the everyday word for someone else referring to you. `3 notes link here` is plain but seventeen characters where the owner wanted concise, and `3 links here` reads as the note's own outgoing links. There is one concept and no linked versus unlinked split, since the owner ruled Obsidian's two kinds unfriendly, so a bare title counting later joins the same list. The code was renamed with the copy so the two vocabularies do not sit side by side: rows are links, and what a note sees is mentions.

**Constraint:** the two wikilink scanners change together, which `ARCHITECTURE.md` carries as an invariant. `finds_the_wikilinks_the_editor_renders` in `src-tauri/src/index.rs` and `src/components/editor/wikilink.spec.ts` assert one table of cases in one order.

**Constraint:** the index carries a schema version in `PRAGMA user_version`. An index behind `SCHEMA_VERSION` is dropped to rows on open, since the mtime skip would otherwise leave every unedited note without rows until someone ran "reindex library". Every later column is a bump and a rebuild rather than a migration.

**Constraint:** the chord is ⌘⇧L. ⌘⇧B would have read better and is TipTap's blockquote toggle.

**Refined: a bare title counts, found on read.** `find_mentions` narrows the vault through FTS to the notes holding the title's words, then scans each body with the same prose mask for whole-word, case-insensitive occurrences outside `[[...]]` and off the note's own title heading. Rejected: `kind = 'mention'` rows in `note_link`. A bare mention of B in A depends on B's title, so a row for it goes stale when B is created or retitled, and A is never re-indexed under the mtime skip; keeping it right would take a reverse pass on every title change and a scan of every write against every title. On read, the cost is one FTS query and a handful of file reads when a note shows, which is the trade Obsidian makes. The filename stem is not searched, since prose carries titles, and two notes sharing a title both count the same line, since nothing in prose can pick one.
