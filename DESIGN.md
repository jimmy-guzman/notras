# DESIGN

Interface conventions for notras. Every rule here is either implemented in `src/styles.css` or observable in the running app. `AGENTS.md` maps the rest of the docs.

## Operating principles

- **The window is the editor.** There is no sidebar and no note list on screen. Anything that is not the note reaches it through ⌘P, ⌘⇧P, a dialog, or the status strip. The one exception is the tab strip, which carries the open set and the controls acting on it: opening, selecting, closing and reordering a tab (`D52`). Renaming, moving, pinning and tagging act on the note rather than the tab, so they stay in the palette, and finding a note is still the palette's job. The two bands carry the note's state and the editor's view state.
- **Keyboard first.** Every action has a shortcut or a palette entry. A feature reachable only by mouse is unfinished, and none is: close others, close to the right and copy path left the tab context menu's exclusive hold when ⌘⇧P took them, and close others is ⌘⌥⇧W as well.
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

- The editor column is `max-w-2xl`, with 24px horizontal padding and `1.65` line-height. Literata carries an `opsz` axis and `.typeset-note` sets `font-optical-sizing: auto`, so the note gets the reading cut rather than the caption cut.
- **The note surface is a shadcn/typeset preset** (`D40`). `.typeset-note` in `src/styles.css` sets three rhythm controls, three faces and one hairline, and the list indent and every block gap derives from them. Tuning the reading surface means moving `--typeset-size`, `--typeset-leading`, or `--typeset-flow`, not writing a rule per element. The heading scale is the one exception.
- **The note reads at 20px below 768px and 18px above it,** at the default root size. The preset uses `--typeset-size: 1.25rem`, changes it to `1.125rem` at `48rem` and in print, and sets `font-size` from that token without the vendored multiplier. The minimum window is 480px, so both sizes are reachable.
- **Code size is independent of prose size.** Fenced code and source mode use `1rem` and `1.7` line-height. Inline code uses `0.9em` to follow the sentence around it. The three faces remain unchanged; the comparison controls belong to the prototype, not the app (`D73`).
- Headings scale from the body size, not from absolute values: `1.88em`, `1.56em`, `1.33em`, then body size for h4, h5 and h6. The ratio is 1.2 a step and stops at h3, which is where a note stops needing ranks. One weight, 600, and one ink, `--foreground`, serve all six, so size alone ranks them, and each takes the same air as any other block: one line, divided back down by the level's scale so it does not grow with the heading.
- UI text sits at `text-xs` for secondary information (status strip, palette metadata, tag chips) and inherits the base size otherwise. Do not invent a per-component size. The six that predate the rule all sit in hand-written CSS, for floating surfaces, code-block chrome, and source mode, and none of them is a precedent.
- **In chrome the mono is for identity and machine text.** The wordmark, the external file's path in its titlebar, and a suggestion's shorthand hint. Everything else in the interface is sans. Inside the note it does the job the table above gives it, which is code.

## Color

The palette uses warm paper and ink in both schemes, with pink as its identifying accent (`D73`). Six neutral colors, eight colored inks, and one derived selection color supply the existing semantic tokens. The reading surface, syntax, and artwork share those values.

- **Every colour is a hex CSS variable in `src/styles.css`.** No component hardcodes a colour value.
- **Dark is the default.** `:root` defines the dark palette and `@media (prefers-color-scheme: light)` redefines the same variables. There is no theme toggle and no `next-themes`; the system decides.
- **`--primary` is the accent. `--accent` is not.** shadcn uses `--accent` for hover surfaces, and the name is its own, not this palette's. Anything reaching for `--accent` to emphasise something has the wrong token.
- **The accent stays out of chrome.** It belongs on the focus ring, the checked task box, a selected table cell, and the syntax keyword colour. It does not belong on the status strip, the title bar, or a toolbar. Chrome carries two tones: `--muted-foreground` when idle and `--foreground` when live.
- **A card moves away from the text colour,** so it is darker than the page in dark and lighter in light. That is what keeps code-block syntax above the contrast floor in both schemes.
- **Tints come from `color-mix` against a token.** A selected table cell is the primary at 12%, and an unchecked task box is the foreground at 25%. Reaching for a new opaque colour means the palette is missing a token.
- **Selection has its own token.** `--selection` mixes paper with blue ink in Oklab. Selected text uses `--foreground`, including syntax and input text, so the selected colors form one readable pair. It leaves pink available for focus and actions.
- **Syntax highlighting uses twelve named roles,** `--syntax-comment` through `--syntax-type`. Emphasis is weight and slant rather than colour, so comments stay italic and keywords stay bold under any palette.
- **Two neutral text tones and an error ink.** `--foreground` carries content, `--muted-foreground` carries secondary information, and `--destructive` carries failures. The existing `--faint` role for next-step lines and placeholders shares secondary ink rather than introducing a lower-contrast color.
- **The webview is told which schemes exist.** `color-scheme: dark light` sits in `index.html` and in the base layer. It supplies the appearance for native controls like the code-block language picker, and without it the webview paints a white canvas at launch whatever the OS is set to.
- **Scrollbars use secondary ink on a transparent track.** The inherited `scrollbar-color` changes their colors without setting their width or replacing native scrolling. Typewriter mode still hides its scrollbar. Engines without `scrollbar-color` retain their system appearance; WebKit added support in [Safari 26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/). Forced-colors mode restores system scrollbar and selection colors.
- **The launch background is restated outside the stylesheet** (`D27`). The window and the webview both paint before `styles.css` exists, so `index.html`, `tauri.conf.json`, and `lib.rs` each carry a copy of `--background`. Change one and change all four, which `src/styles.spec.ts` enforces.

`src/styles.spec.ts` fails the build when a tested text-on-surface pair drops below 4.5:1 in either scheme, or when the two schemes stop declaring the same token names. Adding a token means adding it to both. Placeholder ink clears the same 4.5:1 floor on paper, card, and hover. Body ink also clears 7:1 on paper and card.

### Color method

The recipe derives sRGB hex values before they enter the stylesheet. It uses [Oklab's linear-sRGB conversion matrices](https://bottosson.github.io/posts/oklab/) and [WCAG relative-luminance contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). No color computation runs in the app. The owner approved the lightness and chroma anchors through the complete theme prototype. These choices are reproducible; they do not prove long-session comfort or color-vision accessibility.

1. Neutrals share OKLCH hue `70` and chroma `0.008`. Their lightness values are listed below. The paper carries less yellow than the earlier study; the dark canvas moves a little toward the ink.
2. Colored inks use lightness `0.520` in light and `0.745` in dark, with chroma `0.085`. Pink uses `0.535` / `0.125` in light and `0.765` / `0.105` in dark. Its additional chroma keeps the identifying accent distinct from the other inks.
3. Each color keeps lightness and hue while a 30-step binary search over `[0, requested chroma]` finds the largest in-gamut chroma. A sample is in gamut when all three linear-sRGB channels are in `[0, 1]`. The lower search bound supplies the final chroma. Channels use the sRGB transfer function, then round to the nearest 8-bit integer.
4. Selection mixes 82% paper with 18% blue ink in Cartesian Oklab before gamut mapping and hex conversion. Both source anchors are already in gamut.
5. Dark secondary lightness is `0.675`, lifted from the prototype's `0.670` because its text on hover measured 4.47:1. This is a text-token correction; the hover surface and component styles stay unchanged.

| Neutral role | Light lightness | Dark lightness |
| --- | --- | --- |
| Paper | 0.965 | 0.255 |
| Card and popover | 0.985 | 0.235 |
| Hover | 0.925 | 0.305 |
| Border | 0.850 | 0.380 |
| Body ink | 0.350 | 0.810 |
| Secondary ink | 0.510 | 0.675 |

| Ink | Hue in degrees | Tokens |
| --- | --- | --- |
| Red | 25 | `--destructive` |
| Orange | 65 | `--syntax-keyword-control` |
| Yellow | 100 | `--syntax-number` |
| Green | 150 | `--syntax-string` |
| Cyan | 195 | `--syntax-type` |
| Blue | 255 | `--syntax-function`, `--syntax-member` |
| Violet | 300 | `--syntax-keyword-import`, `--syntax-tag` |
| Pink | 350 | `--primary`, `--ring`, `--syntax-keyword` |

Card and popover share a surface. Secondary, muted, and accent share hover. Border and input share a hairline. Card, popover, secondary, and accent foregrounds share body ink, as do syntax operators. Syntax comments, punctuation, and placeholders share secondary ink. Primary foreground uses paper. These aliases keep the palette at fifteen distinct colors per scheme without changing component contracts.

Body ink measures about 10.24:1 on light paper and 8.74:1 on dark paper. Colored syntax inks measure at least 4.77:1 in light and 6.77:1 in dark on paper and card. The modes share hue assignments, not identical contrast ratios. Keywords retain bold weight and comments retain italics. Contrast measures text against its surface, not how readily two ink colors can be told apart. Hour-three comfort needs time in use; the tests enforce accessibility floors, not comfort.

## The icon

The mark is two closely overlapping loose sheets. The front sheet has a small pink fold at the upper right. Neither sheet carries a face (`D74`).

The mark stays static. It has no animated variant.

- **Colors come from the app tokens.** The sheets use `--foreground`, the seam and tile use `--background`, and the fold uses `--primary`. The icon script reads the hex values from `src/styles.css`; no render supplies a second palette.
- **One SVG supplies every size.** `assets/icon.svg` holds the geometry. In its 136-unit coordinate space the separating stroke is 2 units, widened to 5 at 25 to 32px and 8 at 24px and below. The fold stays at every size.
- **The installed icon keeps a dark tile.** The welcome mark and favicons follow the system scheme. The Apple touch icon uses the dark tile.
- **The desktop tile retains the grid and finish of `D34`.** The mark occupies 136 of the tile's 192 units, matching the approved study. The script draws the tile once rather than maintaining a second shape in SVG.
- **The tray is a monochrome template.** The separating seam and folded corner are transparent so the system can tint the sheets for either menu-bar appearance.
- **The lockup pairs the mark with a regular-weight mono wordmark.** The welcome screen uses a 112px mark, a 28px gap, and a 48px iA Writer Mono wordmark with -0.06em tracking. The tagline is "write another note" on one line, in 20px system type with 1.3 line-height. The README hero breaks the tagline after "write".

## Space and radius

`--radius` is `0.875rem`, and `sm` through `4xl` derive from it in fixed steps. Sizes come from that ladder. A component that needs a radius the ladder does not have is a signal to check the component, not to add a value.

**A nested surface takes the parent's radius less the parent's padding** (`D26`). Write it as `calc()` against the parent token, the way `.suggestion-item` and `.link-editor-input` do, so the two curves stay parallel if `--radius` moves.

Spacing follows Tailwind's scale. Interior padding on small controls stays in the `0.25rem` to `0.75rem` range, which is what the suggestion menu, the code block toolbar, and the link editor already use.

**Every item in the status strip is a shaped item, and the strip sets one gap** (`D36`). The footer is `px-3 gap-1`, a run of like items is `gap-0.5`, and each item's inset comes from the component it is: a 24px box for the view toggles, `Badge` for a tag chip, for `add tag` and for the mentions count, and the badge's `px-2` on the word count so bare text is shaped like its neighbours. Adding an item means choosing what it is. Do not override a variant's padding to reach a distance, which is what the first version of `D36` did and could not keep.

## Motion

Motion carries a state change and nothing else. There is no decorative animation, no entrance choreography beyond the platform's own, and no spring.

- Focus mode fades non-active blocks to `0.28` opacity over `0.3s`, and a wheel or touch scroll fades them back up until the caret engages again (`D64`).
- Hover affordances (code block toolbar, code block buttons, wikilinks) resolve over `0.15s`.
- A dragged tab follows the pointer, and the tabs it crosses slide one place over `0.15s`, as does the released tab and one that ⌘⌥⇧←/→ moves (`D60`).
- The typewriter recentre glides the note over `0.15s` and yields the moment anything else moves the scroller (`D63`).
- A hop in the graph glides the picked note's pill to the centre over `0.15s` and turns its hairline with it, while the pills that leave and arrive cross-fade. The pills and hairlines take chrome's two tones, `--muted-foreground` and `--border` at rest, `--foreground` when one is live, so the graph adds no colour.
- Dialogs, tooltips, and the tag combobox fade, scale, and slide on open and close. This is macOS behaviour for a sheet, and it is the reason the backdrop blurs too.
- Dragged blocks or words follow the pointer under a shadow and their source sits at `0.4` opacity, and neither they nor the bar marking where they land carries a transition, since both track the pointer and that is manipulation rather than a state change (`D71`). Like a dragged tab, they still follow it under reduced motion.
- Shadcn primitives carry their own hover and press transitions, and the toast spinner spins. Beyond those and the tab strip, `src/styles.css` animates only focus mode, wikilinks, and the code-block toolbar and its buttons.
- The window does not bounce. `html` sets `overscroll-behavior: none`, so a flick past the end of a note stays in the note rather than chaining into the document and dragging the titlebar, the tab strip and the status strip with it. A scroller keeps the bounce of its own, which is what an NSScrollView does.

`prefers-reduced-motion: reduce` collapses all of it. Every animation above has a real non-motion end state, so removing the transition costs nothing. A dragged tab still follows the pointer, which is manipulation rather than a transition.

## Interaction and state

- **The window is chrome-less.** `body` sets `user-select: none` so text selection outside the editor does not make the app read as a web page. `.allow-select` is the explicit opt-in for anything selectable.
- **The titlebar carries the note's identity** (`D28`): what it is called, whether it is pinned, and whether it is written (`D38`). Those sit in the drag region rather than in a band of their own, so the active tab's label is the note title, resolved by `D32` from frontmatter, a leading `#`, then the filename (`D52`). It is display-only text: renaming a file is a ⌘⇧P action. `Titlebar` in `src/components/titlebar.tsx` declares the region both windows render. Buttons and inputs inside it set `no-drag` so they stay clickable, and `.no-drag` is the opt-in for anything else that has to receive the pointer there. `src/components/tabs/tab-strip.tsx` is the one other declaration: a tab with no neighbours carries `data-tauri-drag-region` of its own, so pressing and moving it moves the window rather than the tab (`D60`). With no tab open the strip is its `+` alone, so nothing covers the region and the press reaches it.
- **The save state is a glyph, and it sits in the titlebar** (`D35`, `D38`). `SaveIndicator` renders after the tab strip and before the pin (`D52`), a floppy carrying a pen for `dirty`, no badge for `saving`, a check for `saved`, and a slash for `failed`, at `CHROME_GLYPH` in the same 24px box the pin and the view toggles use. `saved` takes the pin's idle `opacity-60` and `failed` takes `--destructive`; `dirty` and `saving` inherit the bar's, so the glyph is lit while a write is outstanding and dim once it lands. The word reaches a hover tooltip and `sr-only` text, never the bar. It follows the active tab, so the empty state's titlebar holds the strip's `+` alone. It sits inside the drag region, which is why it carries `no-drag`.
- **Anything in chrome that turns on and off is a `Toggle`** (`D37`), at `size="icon-xs"`, showing its on-state as `--foreground`. That covers the four view toggles, which are one `ToggleGroup` and so one tab stop with arrow keys inside it, and the pin in the titlebar. The fourth, graph view, renders only for a note, since an external file has no place in the index to be drawn from. Idle is whatever the band gives it: `--muted-foreground` in the status strip, and `--foreground` at `opacity-60` for the pin, since the titlebar carries no muted tone. Hover is a surface and pressed is a tone, which is what keeps the two states apart.
- **A glyph's size follows its role, not its band** (`D51`). A standalone glyph in a chrome control takes `CHROME_GLYPH` from `src/lib/ui/chrome.ts`. An icon beside a word takes 12px, which its button variant usually supplies and the palette's pin marker has to state. Those are the only two roles, so a `size-*` class on an icon anywhere else means the wrong component is wrapping it.
- **Tags are picked from the status strip** (`D30`). A chip reads `#groceries` and filters to that tag; the `TagPlus` button beside it reads `add tag` and opens the combobox, whose vocabulary is the index's own counted tag list. The button is labelled in every state, since an icon alone in a strip of status text says nothing about what it adds. That rule covers an action and not a status: the save glyph above it names a state the user does not operate, so the two are consistent rather than opposed. The chips are the only part that shrinks, so they clip before the button or the word count does.
- **Mentions are counted in the status strip**. The chip is a badge shaped like a tag chip, reading `3 mentions` in tabular numerals after the tags, and it is absent while nothing mentions the note, since a zero would be chrome carrying no information. The chip, ⌘⇧L and the palette's `show mentions` are three doors into one list, whose menu takes the floating-surface recipe below.
- **Chrome starts after the traffic lights.** macOS floats them over the content at the top left, so `--spacing-titlebar` insets everything past them. The value is a platform fact and lives in one place. Windows and Linux put the controls on the right, and would need it mirrored.
- **The titlebar height and the traffic light offset are one decision.** The bar is 36px and `trafficLightPosition` centres the buttons in it, so plain centring puts the title on their line and the space above and below them is equal by construction. The offset is carried twice, in `tauri.conf.json` for the `main` window and in `lib.rs` for `capture`, so both move together. Changing the height means rechecking them, and `D29` records what happens when they drift apart.
- **Two bands frame the note.** The titlebar above and the status strip below, each with a hairline edge drawn as an inset shadow rather than a border, so a 28px band offers all 28 to what it holds. A band that reads as chrome needs an edge, and without one the title floats as stray text over the document.
- **The titlebar holds the open tabs, then the note's controls** (`D52`). Both bands are `--card`, so the note's `--background` reads as its own surface. A tab fills the band height, is square, and is divided from its neighbour by a hairline rather than a gap. The active one is `--background` and paints over the band's bottom hairline, so it reads as continuous with the note below. Tabs divide the strip evenly over a `min-w-24` floor and scroll past it, so a lone tab spans the window. An external file's tab is mono, the way its path was. A dragged tab takes a shadow and paints over the tabs it crosses (`D60`). The save glyph and the pin sit after the strip and follow the active tab.
- **The palette is the action surface.** A new action on the note, a tab, or the app goes in ⌘⇧P rather than into new chrome. `ARCHITECTURE.md` lists what it holds. ⌘P finds a note and ⌘⇧P acts on the app, on the tab that is showing, or on the note inside it, according to what the action reads. Neither lists the other's rows.
- **`·` joins related metadata.** The status strip reads `214 words · 1 min`, a palette row reads `title · folder`. Use the middot rather than a pipe, a dash, or a second line.
- **Floating surfaces share one recipe.** Suggestion menus and the link editor are `position: fixed`, `z-index: 50`, bordered, on `--popover`, with `0 8px 24px rgb(0 0 0 / 0.18)`. Menus clamp to the viewport rather than overflowing it.
- **A chord on screen is drawn by `Chord` from a hotkey, never typed as a glyph.** `src/components/chord.tsx` formats it for the running platform, so `Mod+Shift+N` renders `⌘⇧n` here and `ctrl+shift+n` where the symbols do not exist. A surface that already names an action, such as a palette row, finds its chords through `useChordsByName` instead of carrying them.
- **Shortcuts live in `README.md`.** That table is the one a person looks up, so it is the one that gets extended. Adding a shortcut here as well is how the two drift.

## The editor surface

- The caret takes `--foreground`, and selection takes `--selection`.
- The empty-document placeholder renders through `p.is-editor-empty:first-child::before` on `--faint`, and never as a real node.
- **The reading surface takes no colour of its own** (`D40`). Typeset reads the `--color-*` tokens the `@theme inline` block already emits, so the note is on the palette with nothing repointed. `src/styles.spec.ts` asserts the two roles it derives resolve to a token, and that every `::marker` paints from the muted one.
- **Bullet and ordered lists come from Typeset.** Markers, indentation, and the space between items are its at every depth, and a marker steps disc, circle, then square with depth. `src/styles.css` adds two things. `li > p` loses its block margins so a one-line item stays on one line. And where a node view puts a wrapper between a list item and its content, Typeset's nested step is restated at the shape that wrapper leaves behind, since the block would otherwise take the gap that separates top-level blocks: a task item's content div for a list or a blockquote, and `.code-block-wrapper` for a fence. `src/styles.spec.ts` reads both steps out of the vendored file, so a re-fetch cannot leave them apart.
- **Inline code is a chip, code blocks are a card.** A code span sits on `--muted` in the mono at `0.9em` with a derived radius. Its colour is pinned to `--foreground` rather than inherited (`D40`).
- **Task lists** use flex rows with zero paragraph margins and hand-drawn checkboxes locked to the first text line: a `1em` box with a `1.5px` border, `3px` radius, filled with the primary when checked and masked with an SVG check. A checked item goes muted and struck through without lowering its content's opacity. Every selector reaches a row as `ul[data-type="taskList"] > li` (`D39`). The list is padded like any other list and the row is pulled back by the checkbox column, so text lands at `1.9em` whatever the list kind and at `3.8em` one level in. The gap puts the box's right edge on `0.75em`, the column a disc paints in, and the pull-back cancels box plus gap so the text does not follow. All three are `em`, so the ladder holds at both note sizes, and `src/styles.spec.ts` asserts the pull-back cancels exactly the box and the gap.
- **Tables come from Typeset.** It separates rows, and the lines between cells are drawn here on `--typeset-rule`, the one hairline the quote edge, the divider and the footnote rule also use. There is no outer edge, so a table ends where its content does rather than sitting in a box, and the header drops the rule above it and reads as labels over the columns. A table sizes to its content, and one too wide scrolls inside `.tableWrapper` rather than moving the note.
- **Images** cap at `320px` tall, take `--radius-md`, and show a `--ring` outline when selected.
- **Every link draws one underline, and its style says where it goes.** The same `text-decoration` at the same `1px` and the same offset on all of them, in the current color at 30%, strengthening to full on hover, at weight 500. Dashed inside the library, for a wikilink and for a markdown link whose destination is a note; solid out of it. Not `border-bottom`, which cannot break for a descender and sits at the box edge rather than on the font's metrics. The cursor is a pointer on all of them because a click follows all of them. Where a link goes is shown on hover, in a panel on the popover's surface carrying the url and the way into it, since the destination has nowhere else to appear.
- **Code blocks** sit on `--card` at `--radius-md`, in `--font-mono`, and reveal their toolbar (copy, language picker) on hover or focus-within. The native language picker fits the selected label, with the same height and horizontal padding as copy. An invisible label supplies its width without reserving space for a longer option.
- **Moving blocks adds nothing to the surface** (`D71`). There is no handle and no gutter: what moves is what is selected, and the gesture is the one text already uses. While a drag is in flight a copy of what is held follows the pointer on `--background` under the tab drag's `0 2px 8px rgb(0 0 0 / 0.18)` (`D60`), the source dims where it sits, and a `--primary` bar 2px wide and `1em` tall stands where it will land, which is the drop cursor CodeMirror draws. The copy hugs what it holds under the block's width, so a long paragraph wraps as it did, and it sits `16px` below and right of the pointer so the bar stays in view. It sits in the line as a zero-width inline box, so nothing shifts as it moves.
- **Source mode** strips that chrome: one bare, transparent, wrapping code block at `0.85rem` and `1.7` line-height, so ⌘E reads as the same document rather than a different screen.
- **A gone file** shows a destructive `Alert` at the top of the pane: "this file is gone" over "nothing here is being saved, so copy what you need".

## Copy

- Lowercase, always. Labels, buttons, toasts, tooltips, placeholders, menu items, empty states.
- Errors reach the user in two parts: what failed, in the app's copy, as the title, and why, from the error, as the description, through `reasonOf` in `src/lib/ui/failure.ts`. The title is a lowercase sentence naming the action, written at the call site; the reason comes from the typed failure or the schema that raises it, lowercase and without an error number.
- **An empty state is `Empty`: a title, a description, and an action slot, at the sizes the component sets.** Find with no results reads `nothing found` over `start with # to search by tag`, and actions with none reads it over the chord that finds a note. Never leave a blank pane. A find that matched nothing is the one case with no empty state: the create row stands in its place.
- A pane or screen that could not load is the same `Empty`, with the failure's two parts as its title and description and the retry as an outline button in its action slot.
- The welcome screen, shown when no tab is open, carries the mark and wordmark beside "write another note", with the ⌘n / ⌘p hints below. It keeps its own markup because it introduces the app rather than reporting missing content.
- Name what a control does rather than what it is. The palette entry is "move to folder", not "folder".

## Accessibility

- **FTS snippets never use `dangerouslySetInnerHTML`.** `getSnippetParts` parses the `[[hl]]` markers into segments that render as elements.
- **The `command.tsx` deviation is deliberate.** The sr-only `DialogHeader` moves inside `DialogContent`, because the content is portalled and upstream's placement leaves `aria-labelledby` pointing at a node outside the dialog. Re-apply it whenever the component is regenerated.
- Focus is visible on every interactive element. A shadcn control keeps upstream's `focus-visible` ring, which recolors the border it declares. A `Badge` rendered as a button is the one that arrives without `outline-none`, since upstream never expects a badge to take focus, so the call site adds it or WebKit draws its own ring outside the app's. A control the app draws itself has no such border, so it shows `outline: 2px solid var(--ring)` at `outline-offset: 2px`. Where the focusable element only labels a larger surface, which is the tab strip's case, that surface takes the mark through `has-[:focus-visible]` and takes it inset, since the strip scrolls and would clip an outset one. `src/styles.spec.ts` gates the rule: anything setting `outline: none` or `appearance: none` has to carry a `:focus-visible` rule for the same selector.
- Contrast is a build gate, not a judgement call. `src/styles.spec.ts` measures every text token against the surface it is actually painted on.
- `prefers-reduced-motion: reduce` is honoured globally.
- Autocorrect and autocapitalize are off in the editor, which serves the lowercase aesthetic and removes the platform's blue underline.

## What not to do

- Do not hand-edit `src/components/ui/**`. Those files are generated by `pnpm dlx shadcn@latest add`. Fix non-autofixable lint through the `src/components/ui/**` override block, and re-apply the three deviations `D19` documents. Missing the third silently drops the `xs` and `icon-xs` sizes every toggle in the chrome depends on (`D37`).
- Do not add a color, radius, or font size outside the tokens.
- Do not use `--accent` as the accent, and do not put the accent in chrome.
- Do not add a token to one scheme only.
- Do not add a third band. The titlebar and the status strip are the two, and anything new competes for room inside one of them (`D52`).
- Do not add persistent chrome for an action. If it does not fit the palette, a dialog, or the status strip, question the feature. The tab strip acts on the open set, which is what earns it the close button and the `+`; its other tab actions sit behind a right-click rather than taking room in the band, and reach the keyboard through the palette rather than through chrome of their own. An action on the note inside a tab belongs in the palette too.
- Do not capitalize user-facing text.
- Do not animate anything that is not a state change.
- Do not write an action twice. A second entry point is fine when both route through one implementation; a second copy of the logic is not (`D31`).
