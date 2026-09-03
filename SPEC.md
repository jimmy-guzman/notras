# SPEC

What notras does. Every claim below is checkable against a running build, so a claim nobody can check does not belong here. `ARCHITECTURE.md` carries how the system is built, `DESIGN.md` the interface conventions, and `DEFERRED.md` the work ruled out rather than done.

`AGENTS.md` maps the rest of the docs.

## Notes and files

- Notes live in one directory. It defaults to `~/notras` and settings changes it. The choice is stored in Tauri's `settings.json`.
- First launch creates the notes dir, `.notras/`, and `.notras/index.db`, then scans the folder.
- A note is a file whose extension is `md` or `markdown`. The match is case-sensitive, so `NOTE.MD` is invisible to the app.
- A folder is a directory. Any path segment starting with a dot is skipped, so `.notras/` never indexes itself. Symlinks are never indexed.
- A new note is `untitled.md` in the notes root. A name already taken takes the next free `untitled-2`, then `untitled-3`.
- Creating a note is atomic. Losing the race reports that a note already exists at that path, and leaves no partial file.
- A path segment carries no `/`, `\` or `:`, is not blank, and does not start with a dot. A folder name is at most 120 characters.
- The title resolves from frontmatter `title:`, then the body's leading `#` heading, then the filename with its extension stripped.
- Only the first non-blank line can be that heading, and it takes CommonMark's ATX shape: up to three spaces of indent, one `#`, then a space, a tab, or the end of the line. `##` never matches, and `# C#` keeps its trailing `#`.
- "rename note..." derives a filename from the title: lowercased, with whitespace and `" * / : < > ? \ |` collapsed to `-`, truncated to 120 characters. It rewrites a leading heading the note already has and a `title:` key the note already has, then renames the file.
- Nothing introduces a heading or a `title:` key, so a note carrying neither is only renamed. Nothing else in the app renames a file.
- A rename onto a taken path is refused before the write, so the file is untouched.
- Frontmatter reads three keys: `pinned`, `tags` as an inline or block list, and `title` as read-only. Every other key survives a rewrite verbatim, including its position, and so does the closing delimiter the file used.
- A tag is trimmed, unquoted, stripped of `,`, `[` and `]`, and lowercased. Empty tags are dropped and duplicates collapse.
- "move to folder..." keeps the filename rather than the title, creates the folder if it is missing, and refuses a target that is taken.
- "delete note..." asks once, then removes the file. There is no trash.
- Frontmatter is not searchable. Only the title and the body reach the index.

## Saving

- Typing starts a save 800ms after the last change.
- Losing window focus, unmounting the session, and quitting each flush too.
- The rich editor holds the body. Frontmatter from the last read is composed back around it on every write, so a pin or a tag set elsewhere survives a body save.
- Source mode holds the whole file, frontmatter included, so frontmatter is editable there.
- A write goes to a temporary sibling, syncs, copies the original's permissions, and renames over. A save cannot recreate a file that was deleted.
- Writes are serialized, so two flushes cannot land out of order. A keystroke during a write returns the state to unsaved.
- The save glyph in the title bar reads saved, unsaved, saving, or could not save. A tab whose save failed carries a dot of its own.

## External changes

- The watcher debounces at 300ms, so a file written by anything else reaches the app within about a second. A note appears in the palette under its own title rather than its filename.
- A change event names the files that changed, and only the tabs holding one of them re-read. An event naming nothing means the whole vault changed, and every tab re-reads.
- An external file's path is never named by a change event, so an external tab re-reads when the window regains focus.
- A buffer reloads only when it is clean, the file is newer than this tab's own last write, and the body differs. The reload remounts the editor, so the caret and the undo history go with it.
- Frontmatter follows the file whether or not the buffer is clean.
- A dirty buffer wins. An external edit to a note with unsaved changes is not shown, and the next flush overwrites it.
- A tab whose file was deleted while its buffer was clean closes itself.
- A tab whose file was deleted while it held unsaved edits keeps the text, stops writing, and says the file is gone. Restoring the file clears the banner and the next flush carries what was typed while it was gone.
- A read that fails for any other reason leaves the tab's text alone and toasts once. Repeated failures do not stack a second toast.
- The index skips a file whose mtime matches its stored row, so the app's own writes do not echo back.
- Deleting `.notras/index.db` and relaunching rebuilds it from the files. "reindex library" drops every row and rescans, which is what reaches notes nobody has edited.

## Tabs

- Tabs sit in the title bar. Each holds its own editing session, undo history, and caret.
- ⌘N, ⌘T, the strip's `+`, the tray's new note, the palette's new note, and the palette's create row all open a new note in a new tab.
- Opening a path that is already open activates the tab holding it rather than duplicating it.
- ⏎ in the palette replaces the tab that is showing. ⌘⏎ and ⌘-click open beside it. A wikilink click replaces.
- ⌘W closes the showing tab and the tab on its right takes over, or the one on its left when it was last. Closing a background tab leaves the active one alone.
- Closing the last tab leaves the empty state, where ⌘E, ⌘D, ⌘⌥T and ⌘⇧Y do nothing, the status strip is hidden, and the title bar holds the strip's `+` alone. Pressing and moving the bar beside it moves the window, and a double-click zooms.
- ⌘⇧T reopens the last closed tab in the slot it left. The stack holds ten, and closing the same file twice moves its one entry to the top.
- ⌘1 to ⌘8 select the nth tab and ⌘9 selects the last one. ⌃⇥ and ⌘⌥→ cycle forward, ⌃⇧⇥ and ⌘⌥← cycle back, and both wrap.
- ⌘⌥⇧← and ⌘⌥⇧→ move the tab itself, clamped at the ends.
- A pointer drag starts after 4px and reorders on release. Pressing a tab selects it first, and the close button never starts a drag.
- A lone tab does not reorder. Pressing and moving it moves the window, and double-clicking it zooms.
- Tabs that overflow the strip collapse into a count beside `+`, and picking one shows it.
- The tab context menu offers close, close others, close to the right, and copy path. The last three have no shortcut.
- A file opened through "Open With" is an external tab: labelled by its basename in mono, saved to its own path, absent from the index, and carrying no pin, tags, rename, move, delete, or reveal. Its relative images do not render and its wikilinks do not navigate.
- Quitting and relaunching restores the open tabs, which one was active, and each tab's caret. Scroll position, undo history, and source mode do not survive. A store that does not parse is discarded whole.
- With nothing to restore, the most recently updated note opens.

## Search and the palette

- ⌘P toggles the palette over whatever is showing, in find mode. ⌘⇧P toggles it in actions mode. Pressing one while the other shows switches mode rather than closing.
- Find mode lists notes and never actions. Actions mode lists actions and never notes.
- Search runs on SQLite FTS5 over the title and the body, ranked pinned first, then by bm25, then by recency. With no query the palette lists notes pinned first.
- Each term is stripped to letters, digits and `_`, then matched as a prefix. Terms are joined with AND.
- A hit carries a snippet of at most 24 tokens with the matched text highlighted.
- Search debounces at 150ms and returns at most 30 notes. The idle list shows 20.
- A query starting with `#` filters by tag: `#work budget` narrows to notes tagged `work` and searches them for `budget`. An unknown tag returns nothing.
- `#` alone lists matching tags with their counts, and picking one rewrites the query.
- A find that matches no note offers to create one named for the query, which opens in a new tab. Its filename is derived from what was typed, so `Q3 planning: draft` lands as `q3-planning-draft.md`, and a name already on disk gets a counter rather than overwriting. The row is absent for an empty query and inside a tag filter.
- The actions are new note, pin, edit tags, rename note, move to folder, delete note, reveal in finder, toggle typewriter scrolling, settings, reindex library, and check for updates. Every one but new note, settings, reindex library, and check for updates needs a note showing.
- Leaving a delete, move, rename or tags sub-view returns to actions with an empty input.
- An action that has a shortcut shows it on its row, read from the bindings the app has registered rather than restated: new note carries ⌘n and ⌘t, edit tags ⌘⇧y, toggle typewriter scrolling ⌘⌥t, and settings ⌘,. The rest show none.

## The editor

- The editor is WYSIWYG over the file's markdown, and what lands on disk is the serializer's canonical GFM.
- ⌘E swaps to raw source and back. The caret round-trips in both directions, and a serialization that diverges from a clean re-parse is discarded rather than written.
- In source mode, Tab inserts two spaces and Shift-Tab outdents two.
- `/` opens the slash menu: heading 1, heading 2, heading 3, bullet list, numbered list, task list, quote, code block, table, divider, and today's date. The filter matches the label or the shorthand, so `/h1` finds heading 1.
- `[[` completes note titles, at most eight at a time. A wikilink renders as a pill and serializes back to `[[title]]`.
- Clicking a pill resolves by title first, then by filename, preferring a note in the same folder, then by path. A link matching nothing says so and creates nothing.
- ⌘⇧K adds or edits a link, and ⌘-click opens one. Only `file`, `ftp`, `http`, `https`, `mailto`, `obsidian` and `tel` open; any other scheme is refused with a message. A URL with no scheme gets `https://`.
- A ⌘-click on an attachment link does not open the attachment.
- Dragging files onto the window copies each into `attachments/` and inserts a link into the tab that is showing. A name already taken becomes `stem-2.ext`. Spaces survive on disk and are percent-encoded in the link.
- An image extension inserts an image, anything else a link.
- Pasting an image saves `attachments/pasted-<epoch-ms>.png`.
- Pasting text that looks like markdown pastes rich. Anything else pastes plain. Copying out of the editor puts markdown on the clipboard.
- Tables are editable and start at two columns by three rows with a header. Task checkboxes are clickable and round-trip as `- [x]` and `- [ ]`.
- Strikethrough takes one tilde or two, typed or read from a file, and the closing run may not follow a space. The serializer writes two, so `~x~` in a note written elsewhere saves back as `~~x~~`.
- A literal `` ` ``, `*`, `_`, `[`, `]` or `~` in prose is written to the file as typed. It gains a backslash only where the note would otherwise read back as something else, and then the whole note is escaped.
- A code block carries a copy button and a language picker. The picker keeps a language lowlight does not know rather than rewriting it, and markdown highlights a leading frontmatter block as YAML.
- ⌘D toggles focus mode, which drops every block but the one holding the caret to 28% opacity.
- What the selection covers moves, widened to whole blocks. A caret in a paragraph means that paragraph, a selection across three means those three, and a caret anywhere in a list item means the item with any sublist under it.
- Pressing inside a selection and dragging moves it. A copy of the blocks follows the pointer under a shadow, they dim where they sit, a line marks where they land, and the cursor reads as grabbing for the length of the drag. A drag starts after 4px, and a press that never moves places the caret instead.
- A double or triple click inside a selection still selects the word or the block, since only a single press starts a drag.
- What a block becomes follows where it lands. An item dropped among items of another kind takes that kind, a paragraph dropped between items becomes an item, and an item dropped outside every list becomes its own blocks. Moving the last item out of a list takes the list with it.
- A drop onto a block lands beside it rather than inside it, on the half of the block the pointer is over, so an item dropped on another item stays an item.
- Inside a table the unit is the row: a caret in any cell moves that whole row. A row stays in its own table, so a drop outside it is refused and shows no line, and a paragraph dragged over a table lands before or after it rather than inside.
- The header row does not move, and no row moves above it, since the first row is the one markdown writes as the header.
- ⌥↑ and ⌥↓ move it one sibling at a time, and the first item in a list steps out to sit before the list. A move is one undo step, and inside the editor these no longer jump the caret by paragraph.
- A drag ends with the caret inside what moved and nothing highlighted, since its selection was only what the drag took hold of.
- ⌥↑ and ⌥↓ keep whatever the selection was, so a caret stays a caret and blocks selected together stay selected and move together on the next press. A table row is the exception and ends with a caret the way a drag does, since the row is the unit whatever was selected.
- A keyboard move recentres the caret when typewriter scrolling is on; a drop does not.
- Scrolling by wheel or touch lifts the dim so the rest of the note reads normally, and typing, arrow travel, or a click restores it. Dragging the scrollbar does not lift it.
- ⌘⌥T toggles typewriter scrolling, which holds the caret's line at the editor's vertical centre. The status strip and the palette toggle it too.
- Typing, deleting, undo, paste, and arrow-key travel recentre with a short glide. A click, a drag-selection, and scrolling by hand do not, and the next keystroke recentres.
- The caret types at its natural height until its line reaches the centre and locks there, so scrolling up settles at the note start with no blank above. The last lines reach the centre, toggling the mode does not shift the text, resizing the window keeps the caret's line at its anchor, and with reduce motion on the recentre is instant.
- Inside a code block the caret stays horizontally in view while the mode is on.
- The note's scrollbar is hidden while the mode is on.
- The status strip carries the word count and the reading time at 200 words a minute.
- Focus mode and typewriter scrolling are app-wide rather than per tab, and both survive a relaunch.

## Quick capture

- ⌘⇧N opens the capture window from any app, whether or not notras is in front. The tray offers the same.
- The window is 560 by 320, fixed, always on top, and out of the taskbar. Reopening it shows the one that exists.
- esc and ⌘⏎ save and hide. A double press saves once.
- The note lands in `inbox/` named `yyyy-MM-dd-HHmmss.md`, and a same-second collision takes the next free name.
- Capturing nothing writes nothing, and the window hides.
- A failed save keeps the jot on screen and says so.
- The capture window runs outside the router, so the palette and the tab shortcuts do not reach it. The editor's own keys do.

## The window and the system

- The main window opens at 960 by 720 and stops at 480 by 360.
- macOS draws an overlay title bar with the traffic lights inset, and the app draws a 36px drag region holding the tab strip, the save glyph, and the pin.
- The tray menu offers open notras, new note, quick capture, and quit.
- Closing either window hides it. Quitting is what exits.
- A quit is held until every open buffer has flushed. A buffer that could not write cancels the quit and says so. A buffer whose file is gone reports the quit as safe while still holding text, and its banner is the only warning.
- If the webview never answers, the quit goes through after 5 seconds.
- "Open With" opens each markdown file in its own tab, however many are picked at once. macOS only.
- Settings exposes the notes folder and launch at login. Changing the folder creates its `.notras/`, builds an index, restarts the watcher, and stores the choice.
- The webview cannot write the index. A statement SQLite does not report as read-only is refused.

## Updates

- A production build asks the release endpoint once on launch. It is silent when the app is current and silent when the check itself fails.
- An available version arrives as a toast naming it, with an install button and no timeout. Dismissing it declines.
- Install downloads, flushes every buffer, and relaunches into the new version. A buffer that could not write stops the relaunch, and the downloaded bundle applies at the next launch.
- "check for updates..." reports every outcome, including that update checks are off in development.
- A development build never reaches the updater.

## What is stored where

- The notes folder lives in Tauri's `settings.json`. Launch at login lives with the OS.
- The open tabs, the active tab, and each tab's caret live in `localStorage["tabs"]`. Focus mode and typewriter scrolling live beside them.
- Pins, tags, and a `title:` key live in the note's frontmatter. Attachments live in `attachments/`.
- The index at `.notras/index.db` is derived and disposable.
- The reopen stack, source mode, undo history, and scroll position live in memory and do not survive a relaunch.
