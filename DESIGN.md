# DESIGN

Interface conventions for notras. Every rule here is either implemented in
`src/styles.css` or observable in the running app. `ARCHITECTURE.md` covers how
the system is built, and `DECISIONS.md` covers why.

## Operating principles

- **The window is the editor.** There is no persistent sidebar and no navigation
  chrome. Anything that is not the note reaches the screen through ⌘K, a
  dialog, or the status strip. The two bands that remain, the titlebar and the
  status strip, carry the note's own state and nothing else.
- **Keyboard first.** Every action has a shortcut or a palette entry. A feature
  reachable only by mouse is unfinished.
- **Lowercase everywhere.** Labels, buttons, toasts, tooltips, placeholders, and
  empty states are lowercase, app-wide and deliberate. The wordmark is
  lowercase too.
- **Default to less.** Add nothing that does not earn its place, then remove one
  more thing. New chrome is the last resort; the palette is the first.
- **The last five percent is the work.** A feature that renders but reflows the
  caret, dims the wrong block, or teleports the text on toggle is not shipped.
- **The same problem gets the same solution everywhere.** A second
  implementation of something the app already does is a bug in the design. A
  second entry point into one implementation is not: pin is a titlebar toggle
  and a palette action over one `setNotePinned`, and tags are a status-strip
  picker and a palette view over one `useNoteTags` (`D31`).
- **This is a macOS app.** Where a convention of the platform and a convention
  of the web disagree, the platform wins. Rounded controls, a blurred backdrop,
  and a dialog that scales on open are native behaviour, not decoration.

## Typography

Three faces, each with one job, declared in the `@theme inline` block of
`src/styles.css`:

| Token           | Face                         | Job                                      |
| --------------- | ---------------------------- | ---------------------------------------- |
| `--font-sans`   | `system-ui`, SF Pro on macOS | UI: palette, dialogs, status strip       |
| `--font-mono`   | iA Writer Mono               | Code and data, inside the editor and out |
| `--font-editor` | Literata (SIL OFL)           | The note surface                         |

Resist a fourth. The two bundled faces come through `@fontsource`, so the app
renders the same offline as online, and the sans is the host's own so the chrome
matches whatever the user is running (`D25`).

- The editor column is `max-w-2xl`, which holds body text inside a readable
  measure at the editor's `1rem` size and `1.75` line-height. Literata carries an
  `opsz` axis and `.note-preview-prose` sets `font-optical-sizing: auto`, so the
  note gets the reading cut rather than the caption cut.
- Headings scale from the body size, not from absolute values: `1.6em`,
  `1.35em`, `1.15em`, then `1em` for h4 through h6.
- UI text sits at `text-xs` for secondary information (status strip, palette
  metadata, tag chips) and inherits the base size otherwise. Do not invent a
  per-component size.
- **The wordmark is the only chrome in the mono.** Everything else in the
  interface is sans, and the note is the serif.

## Color

The palette is stet's, whose source of truth is
`packages/tui/src/theme/{dark,light}.ts` (`D23`). Seven values are playa.dev's
lifted variants, because stet treats contrast as a comfortable target while
`src/styles.spec.ts` makes WCAG AA a floor.

- **Every colour is a hex CSS variable in `src/styles.css`.** No component
  hardcodes a colour value.
- **Dark is the default.** `:root` defines the dark palette and
  `@media (prefers-color-scheme: light)` redefines the same variables. There is
  no theme toggle and no `next-themes`; the system decides.
- **`--primary` is the accent. `--accent` is not.** shadcn uses `--accent` for
  hover surfaces, and the name is its own, not this palette's. Anything reaching
  for `--accent` to emphasise something has the wrong token.
- **The accent stays out of chrome.** It belongs on the focus ring, the checked
  task box, a selected table cell, and the syntax keyword colour. It does not
  belong on the status strip, the title bar, or a toolbar. Chrome carries two
  tones: `--muted-foreground` when idle and `--foreground` when live.
- **A card moves away from the text colour,** so it is darker than the page in
  dark and lighter in light. That is what keeps code-block syntax above the
  contrast floor in both schemes.
- **Tints come from `color-mix` against a token.** A selected table cell is the
  primary at 12%, and an unchecked task box is the foreground at 25%. Reaching
  for a new opaque colour means the palette is missing a token.
- **Selection has its own token.** `--selection` carries stet's find-match
  colour. It is not the accent at an opacity, because a wash of the accent
  behind body text reads as a highlighter.
- **Syntax highlighting uses twelve named roles,** `--syntax-comment` through
  `--syntax-type`. Emphasis is weight and slant rather than colour, so comments
  stay italic and keywords stay bold under any palette.
- **Four text tones, and no more.** `--foreground` for content,
  `--muted-foreground` for secondary information, `--faint` for a next-step line
  or a placeholder, and `--destructive` for a failure.
- **The webview is told which schemes exist.** `color-scheme: dark light` sits in
  `index.html` and in the base layer. It themes the scrollbars, the caret, and
  native controls like the code-block language picker, and without it the webview
  paints a white canvas at launch whatever the OS is set to.
- **The launch background is restated outside the stylesheet** (`D27`). The
  window and the webview both paint before `styles.css` exists, so
  `index.html`, `tauri.conf.json`, and `lib.rs` each carry a copy of
  `--background`. Change one and change all four, which
  `src/styles.spec.ts` enforces.

`src/styles.spec.ts` fails the build when a text-on-surface pair drops below
4.5:1 in either scheme, or when the two schemes stop declaring the same token
names. Adding a token means adding it to both.

## Space and radius

`--radius` is `0.875rem`, and `sm` through `4xl` derive from it in fixed steps.
Sizes come from that ladder. A component that needs a radius the ladder does not
have is a signal to check the component, not to add a value.

**A nested surface takes the parent's radius less the parent's padding** (`D26`).
Write it as `calc()` against the parent token, the way `.suggestion-item` and
`.link-editor-input` do, so the two curves stay parallel if `--radius` moves.

Spacing follows Tailwind's scale. Interior padding on small controls stays in
the `0.25rem` to `0.75rem` range, which is what the suggestion menu, the code
block toolbar, and the link editor already use.

## Motion

Motion carries a state change and nothing else. There is no decorative
animation, no entrance choreography beyond the platform's own, and no spring.

- Focus mode fades non-active blocks to `0.28` opacity over `0.3s`.
- Hover affordances (code block toolbar, code block buttons, wikilinks) resolve
  over `0.15s`.
- Dialogs and tooltips fade and scale on open and close. This is macOS
  behaviour for a sheet, and it is the reason the backdrop blurs too.
- Nothing else animates.

`prefers-reduced-motion: reduce` collapses all of it. Every animation above has
a real non-motion end state, so removing the transition costs nothing.

## Interaction and state

- **The window is chrome-less.** `body` sets `user-select: none` so text
  selection outside the editor does not make the app read as a web page.
  `.allow-select` is the explicit opt-in for anything selectable.
- **The titlebar carries the note's identity** (`D28`). Title and pin sit in the
  drag region rather than in a band of their own, so the window title is the
  note title, which is what `D5` already says it is. `Titlebar` in
  `src/components/titlebar.tsx` is the only place the drag region is declared,
  and every window and route renders it. Buttons and inputs inside it set
  `no-drag` so they stay clickable.
- **Tags are picked from the status strip** (`D30`). A chip reads `#groceries`
  and filters to that tag; the `TagPlus` button beside it reads `add tag` and
  opens the combobox, whose vocabulary is the index's own counted tag list. The
  button is labelled in every state, since an icon alone in a strip of status
  text says nothing about what it adds. The chips are the only part that
  shrinks, so they clip before the button or the word count does.
- **Chrome starts after the traffic lights.** macOS floats them over the content
  at the top left, so `--spacing-titlebar` insets everything past them. The value
  is a platform fact and lives in one place. Windows and Linux put the controls
  on the right, and would need it mirrored.
- **The titlebar height and the traffic light offset are one decision.** The bar
  is 44px and `trafficLightPosition` centres the buttons in it, so plain centring
  puts the title on their line and the space above and below them is equal by
  construction. Both values come from scratch, which ships them against the same
  overlay titlebar. Changing the height means rechecking the offset, and `D29`
  records what happens when they drift apart.
- **Two bands frame the note.** The titlebar above and the status strip below,
  each with a hairline border. A band that reads as chrome needs an edge, and
  without one the title floats as stray text over the document.
- **The palette is the action surface.** Search, `#tag` filtering, pin, move,
  delete, reveal, settings, and reindex all live in ⌘K. A new note-level action
  goes there.
- **`·` joins related metadata.** The status strip reads
  `214 words · 1 min`, a palette row reads `title · folder`. Use the middot
  rather than a pipe, a dash, or a second line.
- **Floating surfaces share one recipe.** Suggestion menus and the link editor
  are `position: fixed`, `z-index: 50`, bordered, on `--popover`, with
  `0 8px 24px rgb(0 0 0 / 0.18)`. Menus clamp to the viewport rather than
  overflowing it.
- **Shortcuts:**

  | Shortcut | Action                          |
  | -------- | ------------------------------- |
  | `⌘K`     | command palette (search + acts) |
  | `⌘N`     | new note                        |
  | `⌘P`     | toggle raw markdown source      |
  | `⌘D`     | toggle focus mode               |
  | `⌘⇧K`    | add / edit link                 |
  | `⌘⇧T`    | edit tags                       |
  | `⌘,`     | settings                        |
  | `⌘⇧N`    | global quick capture            |
  | `esc`    | (capture window) save + hide    |

## The editor surface

- The caret takes `--foreground`, and selection takes `--selection`.
- The empty-document placeholder renders through
  `p.is-editor-empty:first-child::before` on `--faint`, and never as a real node.
- **Prose colours are repointed at tokens.** `@tailwindcss/typography` ships its
  own stone ramp, so `.note-preview-prose` sets all sixteen `--tw-prose-*`
  colours from the palette. The rule sits outside `@layer`, which is what makes
  it outrank the utility. Do not add `prose-stone` or `prose-invert` back.
- **Task lists** use flex rows with zero paragraph margins and hand-drawn
  checkboxes locked to the first text line: a `1rem` box with a `1.5px` border,
  `3px` radius, filled with the primary when checked and masked with an SVG
  check. A checked item goes muted, struck through, and drops to `0.7` opacity.
- **Tables** collapse borders, span the full column, and left-align. The header
  row sits on `--card`.
- **Images** cap at `320px` tall, take `--radius-md`, and show a `--ring`
  outline when selected.
- **Wikilinks** read as a dashed underline in the current color at weight 500,
  which distinguishes them from external links without introducing a second link
  color.
- **Code blocks** sit on `--card` at `--radius-md`, in `--font-mono`, and
  reveal their toolbar (copy, language picker) on hover or focus-within.
- **Source mode** strips that chrome: one bare, transparent, wrapping code block
  at `0.85rem` and `1.7` line-height, so ⌘P reads as the same document rather
  than a different screen.

## Copy

- Lowercase, always. Labels, buttons, toasts, tooltips, placeholders, menu
  items, empty states.
- Errors reach the user as `toast.error(error.message)`, so the message on a
  typed failure is user-facing text. Write it as a lowercase sentence naming
  what failed, and keep it in `src/core/errors.ts` or the schema that raises it.
- **An empty state is two lines: what is not here, then what to do about it.**
  The first sits on `--muted-foreground`, the second on `--faint`. The palette
  with no results reads `nothing found` over
  `start with # to search by tag`. Never leave a blank pane.
- The launch empty state is the wordmark, the tagline "just write, otra vez.",
  and the ⌘n / ⌘k hints. It says what to press.
- Name what a control does rather than what it is. The palette entry is "move to
  folder", not "folder".

## Accessibility

- **FTS snippets never use `dangerouslySetInnerHTML`.** `getSnippetParts` parses
  the `[[hl]]` markers into segments that render as elements.
- **The `command.tsx` deviation is deliberate.** The sr-only `DialogHeader` moves
  inside `DialogContent`, because the content is portalled and upstream's
  placement leaves `aria-labelledby` pointing at a node outside the dialog.
  Re-apply it whenever the component is regenerated.
- Focus is visible on every interactive element. Inputs that drop the default
  outline (the tag input, the title field) replace it with a
  `focus-visible:ring` rather than removing the affordance.
- Contrast is a build gate, not a judgement call. `src/styles.spec.ts` measures
  every text token against the surface it is actually painted on.
- `prefers-reduced-motion: reduce` is honoured globally.
- Autocorrect and autocapitalize are off in the editor, which serves the
  lowercase aesthetic and removes the platform's blue underline.

## What not to do

- Do not hand-edit `src/components/ui/**`. Those files are generated by
  `pnpm dlx shadcn@latest add`. Fix non-autofixable lint through the
  `**/components/ui/**` override block, and keep the two documented exceptions
  in `D19`: the `command.tsx` header placement, and the lowercased strings in
  `dialog.tsx` and `command.tsx`.
- Do not add a color, radius, or font size outside the tokens.
- Do not use `--accent` as the accent, and do not put the accent in chrome.
- Do not add a token to one scheme only.
- Do not add persistent chrome. If it does not fit the palette, a dialog, or the
  status strip, question the feature.
- Do not capitalize user-facing text.
- Do not animate anything that is not a state change.
- Do not write an action twice. A second entry point is fine when both route
  through one implementation; a second copy of the logic is not (`D31`).
