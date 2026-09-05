# DESIGN

Interface conventions for notras. Every rule here is either implemented in `src/styles.css` or observable in the running app. `AGENTS.md` maps the rest of the docs.

## Operating principles

- **The window is the editor.** There is no sidebar and no note list on screen. Anything that is not the note reaches it through ⌘P, ⌘⇧P, a dialog, or the status strip. The one exception is the tab strip, which carries the open set and the controls acting on it: opening, selecting, closing and reordering a tab (`D52`). Renaming, moving, pinning and tagging act on the note rather than the tab, so they stay in the palette, and finding a note is still the palette's job. The two bands carry the note's state and the editor's view state.
- **Keyboard first.** Every action has a shortcut or a palette entry. A feature reachable only by mouse is unfinished. Three still are, and `DEFERRED.md` carries them as ruled out rather than accepted: close others, close to the right and copy path sit in the tab context menu alone.
- **Lowercase everywhere.** Labels, buttons, toasts, tooltips, placeholders, and empty states are lowercase, app-wide and deliberate. The wordmark is lowercase too.
- **Default to less.** Add nothing that does not earn its place, then remove one more thing. New chrome is the last resort; the palette is the first, and chrome that arrives displaces something rather than joining it: the tab strip took the title's place in the band rather than adding a band (`D52`).
- **The last five percent is the work.** A feature that renders but reflows the caret, dims the wrong block, or teleports the text on toggle is not shipped.
- **The same problem gets the same solution everywhere.** A second implementation of something the app already does is a bug in the design. A second entry point into one implementation is not: pin is a titlebar toggle and a palette action over one `setNotePinned`, and tags are a status-strip picker and a palette view over one `useNoteTags` (`D31`).
- **This is a macOS app.** Where a convention of the platform and a convention of the web disagree, the platform wins. Rounded controls, a blurred backdrop, and a dialog that scales on open are native behaviour, not decoration.

## Typography

Three faces, each with one job, declared in the `@theme inline` block of `src/styles.css`:

| Token           | Face                         | Job                                      |
| --------------- | ---------------------------- | ---------------------------------------- |
| `--font-sans`   | `system-ui`, SF Pro on macOS | UI: palette, dialogs, status strip       |
| `--font-mono`   | iA Writer Mono               | Code and data, inside the editor and out |
| `--font-editor` | Literata (SIL OFL)           | The note surface                         |

Resist a fourth. The two bundled faces come through `@fontsource`, so the app renders the same offline as online, and the sans is the host's own so the chrome matches whatever the user is running (`D25`).

- The editor column is `max-w-2xl`, which holds body text inside a readable measure at the editor's `1rem` size and `1.75` line-height. Literata carries an `opsz` axis and `.typeset-note` sets `font-optical-sizing: auto`, so the note gets the reading cut rather than the caption cut.
- **The note surface is a shadcn/typeset preset** (`D40`). `.typeset-note` in `src/styles.css` sets three rhythm controls and three faces, and every heading size, list indent and block gap derives from them. Tuning the reading surface means moving `--typeset-size`, `--typeset-leading`, or `--typeset-flow`, not writing a rule per element.
- **The note reads a size larger below 768px.** Typeset's base is `calc(var(--typeset-size) * 1.125)` and a `min-width: 48rem` viewport query resets it, so a window narrower than that renders at `1.125rem` and wider at `1rem`. The minimum window is 480px, so both are reachable.
- Headings scale from the body size, not from absolute values: `1.75em`, `1.25em`, `1.125em`, `1em`, then `0.875em` and `0.8125em`. h5 and h6 drop to `--muted-foreground` at weight 500, and h6 is uppercased with `0.08em` tracking, so the two deepest levels read as labels rather than headings.
- UI text sits at `text-xs` for secondary information (status strip, palette metadata, tag chips) and inherits the base size otherwise. Do not invent a per-component size. The six that predate the rule all sit in hand-written CSS, for floating surfaces, code-block chrome, and source mode, and none of them is a precedent.
- **In chrome the mono is for identity and machine text.** The wordmark, the external file's path in its titlebar, and a suggestion's shorthand hint. Everything else in the interface is sans. Inside the note it does the job the table above gives it, which is code.

## Color

The palette is stet's, with seven values lifted from playa.dev so the gate below passes (`D23`).

- **Every colour is a hex CSS variable in `src/styles.css`.** No component hardcodes a colour value.
- **Dark is the default.** `:root` defines the dark palette and `@media (prefers-color-scheme: light)` redefines the same variables. There is no theme toggle and no `next-themes`; the system decides.
- **`--primary` is the accent. `--accent` is not.** shadcn uses `--accent` for hover surfaces, and the name is its own, not this palette's. Anything reaching for `--accent` to emphasise something has the wrong token.
- **The accent stays out of chrome.** It belongs on the focus ring, the checked task box, a selected table cell, and the syntax keyword colour. It does not belong on the status strip, the title bar, or a toolbar. Chrome carries two tones: `--muted-foreground` when idle and `--foreground` when live.
- **A card moves away from the text colour,** so it is darker than the page in dark and lighter in light. That is what keeps code-block syntax above the contrast floor in both schemes.
- **Tints come from `color-mix` against a token.** A selected table cell is the primary at 12%, and an unchecked task box is the foreground at 25%. Reaching for a new opaque colour means the palette is missing a token.
- **Selection has its own token.** `--selection` carries stet's find-match colour. It is not the accent at an opacity, because a wash of the accent behind body text reads as a highlighter.
- **Syntax highlighting uses twelve named roles,** `--syntax-comment` through `--syntax-type`. Emphasis is weight and slant rather than colour, so comments stay italic and keywords stay bold under any palette.
- **Four text tones, and no more.** `--foreground` for content, `--muted-foreground` for secondary information, `--faint` for a next-step line or a placeholder, and `--destructive` for a failure.
- **The webview is told which schemes exist.** `color-scheme: dark light` sits in `index.html` and in the base layer. It themes the scrollbars, the caret, and native controls like the code-block language picker, and without it the webview paints a white canvas at launch whatever the OS is set to.
- **The launch background is restated outside the stylesheet** (`D27`). The window and the webview both paint before `styles.css` exists, so `index.html`, `tauri.conf.json`, and `lib.rs` each carry a copy of `--background`. Change one and change all four, which `src/styles.spec.ts` enforces.

`src/styles.spec.ts` fails the build when a text-on-surface pair drops below 4.5:1 in either scheme, or when the two schemes stop declaring the same token names. Adding a token means adding it to both. `--faint` is the one exemption, held to 2:1: it paints a placeholder and a next-step hint, which are the two kinds of text that read as absent until wanted.

## The icon

The mark is two overlapping organic blobs on a dark squircle: one sheet of paper with another behind it, which is the app's subject drawn literally. The front blob carries two dot eyes flanked by two accent dots, and the back blob carries two eyes only.

- **The icon's palette follows the render, not the tokens** (`D33`). This is the one place the no-hardcoded-colour rule above does not reach. The vector files match the render so the icon does not change shade between sizes, and `D33` carries the swatches and why they sit off the palette.
- **The accent appears here and nowhere else in chrome.** The rule above keeps `--primary` on the focus ring and the checked box. An app icon is identity rather than chrome, so the two accent dots are the exception, and they are two dots at 2.5% of the tile rather than a field of colour.
- **Detail is keyed to size, not scaled** (`D33`). The accent drops at 40px and every dot at 16px, because a 2.5%-of-tile dot is sub-pixel there. Three vector files cover the three ranges, and `source_for` in `scripts/icons.sh` sets the boundaries.
- **The tile is a superellipse at exponent 5.0 on Apple's 824-on-1024 grid,** so the art fills 80.5% of the canvas and the corners match what macOS draws around it. The figure is measured, not chosen: seven macOS 26 system icons all fit 5.00 at that same 80.5% fill (`D34`). `D26` governs radii inside the interface; this is the same concern at the app's outer edge.
- **The edge carries a lit rim and a baked drop shadow** (`D34`). macOS puts both into every icon it ships, and the 9.8% margin exists to hold the shadow. The rim is ~20px at 1024, brightest at the top, decaying to the tile colour; the shadow sits 10px down, blurred 13px, at 17% opacity. Without them the icon reads flat beside its Dock neighbours, which is the one thing a dark tile cannot hide.
- **The tray glyph is a silhouette with a gap, and carries no dots.** At the 18pt the menu bar gives it, an eye would be 0.7pt. The two shapes read only because a transparent gap separates them.
- **The light favicon's tile is `--secondary`, not `--background`.** A favicon is the one place the mark switches scheme, and a white front blob on `#f7f8fa` has almost no edge, which left the blob defined only by its neighbours. The darker tile gives it one.

## Space and radius

`--radius` is `0.875rem`, and `sm` through `4xl` derive from it in fixed steps. Sizes come from that ladder. A component that needs a radius the ladder does not have is a signal to check the component, not to add a value.

**A nested surface takes the parent's radius less the parent's padding** (`D26`). Write it as `calc()` against the parent token, the way `.suggestion-item` and `.link-editor-input` do, so the two curves stay parallel if `--radius` moves.

Spacing follows Tailwind's scale. Interior padding on small controls stays in the `0.25rem` to `0.75rem` range, which is what the suggestion menu, the code block toolbar, and the link editor already use.

**Every item in the status strip is a shaped item, and the strip sets one gap** (`D36`). The footer is `px-3 gap-1`, a run of like items is `gap-0.5`, and each item's inset comes from the component it is: a 24px box for the view toggles, `Badge` for a tag chip, `Button size="xs"` for `add tag`, and the badge's `px-2` on the word count so bare text is shaped like its neighbours. Adding an item means choosing what it is. Do not override a variant's padding to reach a distance, which is what the first version of `D36` did and could not keep.

## Motion

Motion carries a state change and nothing else. There is no decorative animation, no entrance choreography beyond the platform's own, and no spring.

- Focus mode fades non-active blocks to `0.28` opacity over `0.3s`, and a wheel or touch scroll fades them back up until the caret engages again (`D64`).
- Hover affordances (code block toolbar, code block buttons, wikilinks) resolve over `0.15s`.
- A dragged tab follows the pointer, and the tabs it crosses slide one place over `0.15s`, as does the released tab and one that ⌘⌥⇧←/→ moves (`D60`).
- The typewriter recentre glides the note over `0.15s` and yields the moment anything else moves the scroller (`D63`).
- Dialogs, tooltips, and the tag combobox fade, scale, and slide on open and close. This is macOS behaviour for a sheet, and it is the reason the backdrop blurs too.
- Dragged blocks or words follow the pointer under a shadow and their source sits at `0.4` opacity, and neither they nor the bar marking where they land carries a transition, since both track the pointer and that is manipulation rather than a state change (`D71`). Like a dragged tab, they still follow it under reduced motion.
- Shadcn primitives carry their own hover and press transitions, and the toast spinner spins. Beyond those and the tab strip, `src/styles.css` animates only focus mode, wikilinks, and the code-block toolbar and its buttons.
- The window does not bounce. `html` sets `overscroll-behavior: none`, so a flick past the end of a note stays in the note rather than chaining into the document and dragging the titlebar, the tab strip and the status strip with it. A scroller keeps the bounce of its own, which is what an NSScrollView does.

`prefers-reduced-motion: reduce` collapses all of it. Every animation above has a real non-motion end state, so removing the transition costs nothing. A dragged tab still follows the pointer, which is manipulation rather than a transition.

## Interaction and state

- **The window is chrome-less.** `body` sets `user-select: none` so text selection outside the editor does not make the app read as a web page. `.allow-select` is the explicit opt-in for anything selectable.
- **The titlebar carries the note's identity** (`D28`): what it is called, whether it is pinned, and whether it is written (`D38`). Those sit in the drag region rather than in a band of their own, so the active tab's label is the note title, resolved by `D32` from frontmatter, a leading `#`, then the filename (`D52`). It is display-only text: renaming a file is a ⌘⇧P action. `Titlebar` in `src/components/titlebar.tsx` declares the region both windows render. Buttons and inputs inside it set `no-drag` so they stay clickable, and `.no-drag` is the opt-in for anything else that has to receive the pointer there. `src/components/tabs/tab-strip.tsx` is the one other declaration: a tab with no neighbours carries `data-tauri-drag-region` of its own, so pressing and moving it moves the window rather than the tab (`D60`). With no tab open the strip is its `+` alone, so nothing covers the region and the press reaches it.
- **The save state is a glyph, and it sits in the titlebar** (`D35`, `D38`). `SaveIndicator` renders after the tab strip and before the pin (`D52`), a floppy carrying a pen for `dirty`, no badge for `saving`, a check for `saved`, and a slash for `failed`, at `CHROME_GLYPH` in the same 24px box the pin and the view toggles use. `saved` takes the pin's idle `opacity-60` and `failed` takes `--destructive`; `dirty` and `saving` inherit the bar's, so the glyph is lit while a write is outstanding and dim once it lands. The word reaches a hover tooltip and `sr-only` text, never the bar. It follows the active tab, so the empty state's titlebar holds the strip's `+` alone. It sits inside the drag region, which is why it carries `no-drag`.
- **Anything in chrome that turns on and off is a `Toggle`** (`D37`), at `size="icon-xs"`, showing its on-state as `--foreground`. That covers the three view toggles, which are one `ToggleGroup` and so one tab stop with arrow keys inside it, and the pin in the titlebar. Idle is whatever the band gives it: `--muted-foreground` in the status strip, and `--foreground` at `opacity-60` for the pin, since the titlebar carries no muted tone. Hover is a surface and pressed is a tone, which is what keeps the two states apart.
- **A glyph's size follows its role, not its band** (`D51`). A standalone glyph in a chrome control takes `CHROME_GLYPH` from `src/lib/ui/chrome.ts`. An icon beside a word takes 12px, which its button variant usually supplies and the palette's pin marker has to state. Those are the only two roles, so a `size-*` class on an icon anywhere else means the wrong component is wrapping it.
- **Tags are picked from the status strip** (`D30`). A chip reads `#groceries` and filters to that tag; the `TagPlus` button beside it reads `add tag` and opens the combobox, whose vocabulary is the index's own counted tag list. The button is labelled in every state, since an icon alone in a strip of status text says nothing about what it adds. That rule covers an action and not a status: the save glyph above it names a state the user does not operate, so the two are consistent rather than opposed. The chips are the only part that shrinks, so they clip before the button or the word count does.
- **Chrome starts after the traffic lights.** macOS floats them over the content at the top left, so `--spacing-titlebar` insets everything past them. The value is a platform fact and lives in one place. Windows and Linux put the controls on the right, and would need it mirrored.
- **The titlebar height and the traffic light offset are one decision.** The bar is 36px and `trafficLightPosition` centres the buttons in it, so plain centring puts the title on their line and the space above and below them is equal by construction. The offset is carried twice, in `tauri.conf.json` for the `main` window and in `lib.rs` for `capture`, so both move together. Changing the height means rechecking them, and `D29` records what happens when they drift apart.
- **Two bands frame the note.** The titlebar above and the status strip below, each with a hairline border. A band that reads as chrome needs an edge, and without one the title floats as stray text over the document.
- **The titlebar holds the open tabs, then the note's controls** (`D52`). Both bands are `--card`, so the note's `--background` reads as its own surface. A tab fills the band height, is square, and is divided from its neighbour by a hairline rather than a gap. The active one is `--background` and paints over the band's bottom hairline, so it reads as continuous with the note below. Tabs divide the strip evenly over a `min-w-24` floor and scroll past it, so a lone tab spans the window. An external file's tab is mono, the way its path was. A dragged tab takes a shadow and paints over the tabs it crosses (`D60`). The save glyph and the pin sit after the strip and follow the active tab.
- **The palette is the action surface.** A new note-level action goes in ⌘⇧P rather than into new chrome. `ARCHITECTURE.md` lists what it holds. ⌘P finds a note and ⌘⇧P acts on one, and neither lists the other's rows.
- **`·` joins related metadata.** The status strip reads `214 words · 1 min`, a palette row reads `title · folder`. Use the middot rather than a pipe, a dash, or a second line.
- **Floating surfaces share one recipe.** Suggestion menus and the link editor are `position: fixed`, `z-index: 50`, bordered, on `--popover`, with `0 8px 24px rgb(0 0 0 / 0.18)`. Menus clamp to the viewport rather than overflowing it.
- **A chord on screen is drawn by `Chord` from a hotkey, never typed as a glyph.** `src/components/chord.tsx` formats it for the running platform, so `Mod+Shift+N` renders `⌘⇧n` here and `ctrl+shift+n` where the symbols do not exist. A surface that already names an action, such as a palette row, finds its chords through `useChordsByName` instead of carrying them.
- **Shortcuts live in `README.md`.** That table is the one a person looks up, so it is the one that gets extended. Adding a shortcut here as well is how the two drift.

## The editor surface

- The caret takes `--foreground`, and selection takes `--selection`.
- The empty-document placeholder renders through `p.is-editor-empty:first-child::before` on `--faint`, and never as a real node.
- **The reading surface takes no colour of its own** (`D40`). Typeset reads the `--color-*` tokens the `@theme inline` block already emits, so the note is on the palette with nothing repointed. `src/styles.spec.ts` asserts the two roles it derives resolve to a token, and that every `::marker` paints from the muted one.
- **Bullet and ordered lists come from Typeset.** Markers, indentation, and the space between items are its at every depth, and a marker steps disc, circle, then square with depth. `src/styles.css` adds two things. `li > p` loses its block margins so a one-line item stays on one line. And where a node view puts a wrapper between a list item and its content, Typeset's nested step is restated at the shape that wrapper leaves behind, since the block would otherwise take the gap that separates top-level blocks: a task item's content div for a list or a blockquote, and `.code-block-wrapper` for a fence. `src/styles.spec.ts` reads both steps out of the vendored file, so a re-fetch cannot leave them apart.
- **Inline code is a chip, code blocks are a card.** A code span sits on `--muted` in the mono at `0.85em` with a derived radius. Its colour is pinned to `--foreground` rather than inherited, because h5, h6, a strikethrough and a definition are all muted and a muted glyph on the chip measures 3.73:1 (`D40`).
- **Task lists** use flex rows with zero paragraph margins and hand-drawn checkboxes locked to the first text line: a `1em` box with a `1.5px` border, `3px` radius, filled with the primary when checked and masked with an SVG check. A checked item goes muted, struck through, and drops to `0.7` opacity. Every selector reaches a row as `ul[data-type="taskList"] > li` (`D39`). The list is padded like any other list and the row is pulled back by the checkbox column, so text lands at `1.9em` whatever the list kind and at `3.8em` one level in. The gap puts the box's right edge on `0.75em`, the column a disc paints in, and the pull-back cancels box plus gap so the text does not follow. All three are `em`, so the ladder holds at both note sizes, and `src/styles.spec.ts` asserts the pull-back cancels exactly the box and the gap.
- **Tables** collapse borders, span the full column, and left-align. The header row sits on `--card`. They opt out of Typeset with `not-typeset`, which is why the table sets its own `margin-block-start` from `--typeset-flow` (`D40`).
- **Images** cap at `320px` tall, take `--radius-md`, and show a `--ring` outline when selected.
- **Wikilinks** read as a dashed underline in the current color at weight 500, which distinguishes them from external links without introducing a second link color.
- **Code blocks** sit on `--card` at `--radius-md`, in `--font-mono`, and reveal their toolbar (copy, language picker) on hover or focus-within.
- **Moving blocks adds nothing to the surface** (`D71`). There is no handle and no gutter: what moves is what is selected, and the gesture is the one text already uses. While a drag is in flight a copy of what is held follows the pointer on `--background` under the tab drag's `0 2px 8px rgb(0 0 0 / 0.18)` (`D60`), the source dims where it sits, and a `--primary` bar 2px wide and `1em` tall stands where it will land, which is the drop cursor CodeMirror draws. The copy hugs what it holds under the block's width, so a long paragraph wraps as it did, and it sits `16px` below and right of the pointer so the bar stays in view. It sits in the line as a zero-width inline box, so nothing shifts as it moves.
- **Source mode** strips that chrome: one bare, transparent, wrapping code block at `0.85rem` and `1.7` line-height, so ⌘E reads as the same document rather than a different screen.
- **A gone file** shows a destructive `Alert` at the top of the pane: "this file is gone" over "nothing here is being saved, so copy what you need".

## Copy

- Lowercase, always. Labels, buttons, toasts, tooltips, placeholders, menu items, empty states.
- Errors reach the user in two parts: what failed, in the app's copy, as the title, and why, from the error, as the description, through `reasonOf` in `src/lib/ui/failure.ts`. The title is a lowercase sentence naming the action, written at the call site; the reason comes from the typed failure or the schema that raises it, lowercase and without an error number.
- **An empty state is `Empty`: a title, a description, and an action slot, at the sizes the component sets.** Find with no results reads `nothing found` over `start with # to search by tag`, and actions with none reads it over the chord that finds a note. Never leave a blank pane. A find that matched nothing is the one case with no empty state: the create row stands in its place.
- A pane or screen that could not load is the same `Empty`, with the failure's two parts as its title and description and the retry as an outline button in its action slot.
- The welcome screen, shown when no tab is open, is not an empty state: it is the wordmark, the tagline "just write, otra vez.", and the ⌘n / ⌘p hints, in its own markup. It says what to press.
- Name what a control does rather than what it is. The palette entry is "move to folder", not "folder".

## Accessibility

- **FTS snippets never use `dangerouslySetInnerHTML`.** `getSnippetParts` parses the `[[hl]]` markers into segments that render as elements.
- **The `command.tsx` deviation is deliberate.** The sr-only `DialogHeader` moves inside `DialogContent`, because the content is portalled and upstream's placement leaves `aria-labelledby` pointing at a node outside the dialog. Re-apply it whenever the component is regenerated.
- Focus is visible on every interactive element. Inputs that drop the default outline replace it with a `focus-visible:ring` rather than removing the affordance. Two hand-written controls still break this and are the standing gap: `.link-editor-input` and `.code-block-language`, which set `outline: none` and replace nothing.
- Contrast is a build gate, not a judgement call. `src/styles.spec.ts` measures every text token against the surface it is actually painted on.
- `prefers-reduced-motion: reduce` is honoured globally.
- Autocorrect and autocapitalize are off in the editor, which serves the lowercase aesthetic and removes the platform's blue underline.

## What not to do

- Do not hand-edit `src/components/ui/**`. Those files are generated by `pnpm dlx shadcn@latest add`. Fix non-autofixable lint through the `src/components/ui/**` override block, and re-apply the three deviations `D19` documents. Missing the third silently drops the `xs` and `icon-xs` sizes every toggle in the chrome depends on (`D37`).
- Do not add a color, radius, or font size outside the tokens.
- Do not use `--accent` as the accent, and do not put the accent in chrome.
- Do not add a token to one scheme only.
- Do not add a third band. The titlebar and the status strip are the two, and anything new competes for room inside one of them (`D52`).
- Do not add persistent chrome for an action. If it does not fit the palette, a dialog, or the status strip, question the feature. The tab strip acts on the open set, which is what earns it the close button and the `+`; its other tab actions sit behind a right-click rather than taking room in the band. Three of those have no shortcut or palette entry yet, which the keyboard-first rule above counts as unfinished. An action on the note inside a tab belongs in the palette.
- Do not capitalize user-facing text.
- Do not animate anything that is not a state change.
- Do not write an action twice. A second entry point is fine when both route through one implementation; a second copy of the logic is not (`D31`).
