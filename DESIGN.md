# DESIGN

Interface conventions for notras. Every rule here is either implemented in
`src/styles.css` or observable in the running app. `ARCHITECTURE.md` covers how
the system is built, and `DECISIONS.md` covers why.

## Operating principles

- **The window is the editor.** There is no persistent sidebar and no navigation
  chrome. Anything that is not the note reaches the screen through ⌘K, a
  dialog, or the status strip.
- **Keyboard first.** Every action has a shortcut or a palette entry. A feature
  reachable only by mouse is unfinished.
- **Lowercase everywhere.** Labels, buttons, toasts, tooltips, placeholders, and
  empty states are lowercase, app-wide and deliberate. The wordmark is
  lowercase too.
- **Default to less.** Add nothing that does not earn its place, then remove one
  more thing. New chrome is the last resort; the palette is the first.
- **The last five percent is the work.** A feature that renders but reflows the
  caret, dims the wrong block, or teleports the text on toggle is not shipped.
- **The same problem gets the same solution everywhere.** A second way to do
  something the app already does is a bug in the design.

## Typography

Four faces, each with one job, declared in the `@theme inline` block of
`src/styles.css`:

| Token                | Face                        | Job                                     |
| -------------------- | --------------------------- | --------------------------------------- |
| `--font-sans`        | DM Sans Variable            | UI: palette, dialogs, status strip      |
| `--font-mono`        | Geist Mono                  | Code and data outside the editor        |
| `--font-editor`      | iA Writer Quattro (SIL OFL) | The note surface                        |
| `--font-editor-mono` | iA Writer Mono              | Code spans and blocks inside the editor |

Resist a fifth. All four are bundled through `@fontsource`, so the app renders
the same offline as online.

- The editor column is `max-w-2xl`, which holds body text inside a readable
  measure at the editor's `1rem` size and `1.75` line-height.
- Headings scale from the body size, not from absolute values: `1.6em`,
  `1.35em`, `1.15em`, then `1em` for h4 through h6. `.note-preview-prose`
  mirrors the live editor scale so toggling ⌘P never makes text jump.
- UI text sits at `text-xs` for secondary information (status strip, palette
  metadata, tag input) and inherits the base size otherwise. Do not invent a
  per-component size.

## Color

- **Stone base, oklch only.** Every color is a CSS variable in `src/styles.css`.
  No component hardcodes a color value.
- **Dark is the default.** `:root` defines the dark palette and
  `@media (prefers-color-scheme: light)` redefines the same variables. There is
  no theme toggle and no `next-themes`; the system decides.
- **Tints come from `color-mix` against a token.** Selection is the primary at
  22%, a selected table cell is the primary at 12%, an unchecked task box is the
  foreground at 25%. Reaching for a new opaque color means the palette is
  missing a token.
- **Syntax highlighting reuses the chart ramp.** lowlight classes map onto
  `--chart-1` through `--chart-5` plus `--muted-foreground`, so code blocks stay
  inside the app palette in both schemes.

## Space and radius

`--radius` is `0.875rem`, and `sm` through `4xl` derive from it in fixed steps.
Sizes come from that ladder. A component that needs a radius the ladder does not
have is a signal to check the component, not to add a value.

Spacing follows Tailwind's scale. Interior padding on small controls stays in
the `0.25rem` to `0.75rem` range, which is what the suggestion menu, the code
block toolbar, and the link editor already use.

## Motion

Motion carries a state change and nothing else. There is no decorative
animation, no entrance choreography, and no spring.

The three live durations, all `ease`:

- Focus mode fades non-active blocks to `0.28` opacity over `0.3s`.
- Hover affordances (code block toolbar, code block buttons, wikilinks) resolve
  over `0.15s`.
- Nothing else animates.

## Interaction and state

- **The window is chrome-less.** `body` sets `user-select: none` so text
  selection outside the editor does not make the app read as a web page.
  `.allow-select` is the explicit opt-in for anything selectable.
- **The title bar is an invisible drag strip.** `.titlebar-drag-region` drags the
  window; buttons and inputs inside it set `no-drag` so they stay clickable.
- **The palette is the action surface.** Search, `#tag` filtering, pin, move,
  delete, reveal, settings, and reindex all live in ⌘K. A new note-level action
  goes there.
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
  | `⌘,`     | settings                        |
  | `⌘⇧N`    | global quick capture            |
  | `esc`    | (capture window) save + hide    |

## The editor surface

- The caret takes `--foreground`, and selection takes the primary at 22%.
- The empty-document placeholder renders through
  `p.is-editor-empty:first-child::before` at half opacity on
  `--muted-foreground`, and never as a real node.
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
- **Code blocks** sit on `--card` at `--radius-md`, in `--font-editor-mono`, and
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
- The empty state is the wordmark, the tagline "just write, otra vez.", and the
  ⌘n / ⌘k hints. It says what to press.
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
- Autocorrect and autocapitalize are off in the editor, which serves the
  lowercase aesthetic and removes the platform's blue underline.

## What not to do

- Do not hand-edit `src/components/ui/**`. Those files are generated by
  `pnpm dlx shadcn@latest add`. Fix non-autofixable lint through the
  `**/components/ui/**` override block, and keep the one documented exception in
  `command.tsx`.
- Do not add a color, radius, or font size outside the tokens.
- Do not add persistent chrome. If it does not fit the palette, a dialog, or the
  status strip, question the feature.
- Do not capitalize user-facing text.
- Do not animate anything that is not a state change.
- Do not introduce a second way to reach an action that already has one.
