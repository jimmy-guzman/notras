# SPEC

What notras does. Every claim below is checkable against a running build, so a claim nobody can check does not belong here. `ARCHITECTURE.md` carries how the system is built and `DESIGN.md` the interface conventions. [GitHub issues](https://github.com/jimmy-guzman/notras/issues) track actionable future work.

`AGENTS.md` maps the rest of the docs.

## Appearance

- The app follows the system's light or dark scheme. Both schemes use warm reading surfaces and a pink accent, with no in-app theme switch.
- Body text has at least 7:1 contrast on the page and code-block surface in both schemes. Syntax inks have at least 4.5:1 on those surfaces. Comments and punctuation use the secondary text tone; operators use body ink. Placeholders share secondary ink and clear 4.5:1 on the page, card, and hover surface. Selection uses a muted blue surface.
- At the default root size, prose renders in Literata at 16px across window widths and in print, with 1.65 line-height. Fenced code and source mode render in iA Writer Mono at 14px with 1.5 line-height across those widths and in print. Inline code follows the surrounding text at 0.9em. The reading column remains at most 42rem wide with 24px horizontal padding.
- Selected text uses body ink on the same blue surface in editors and inputs. Completed tasks use secondary ink and a strikethrough without additional opacity.
- The note and source editors use shadcn's scrollbar. It fades in over 150 ms during user scrolling, including keyboard scrolling, then fades out over 300 ms after 500 ms of inactivity. Hover alone does not reveal it, and a hidden bar does not intercept clicks. It stays visible while its thumb is held, including a pause during a drag. Focus mode hides the note scrollbar while wheel, touch, and keyboard scrolling still work. Reduced motion removes the fade. Other native scroll surfaces keep their system colors, width, and visibility behavior. Forced-colors mode uses system selection colors.
- Continuous scrolling keeps the text and scrollbar moving together in notes with many highlighted code blocks, including in installed builds.
- Main and capture windows use the matching page background at launch and after a system-theme change.
- The mark is two overlapping sheets with a pink upper-right fold. The installed icon keeps its dark tile; the welcome mark and favicons follow the system scheme. The tray is system-tinted, with a transparent seam and fold.
- With no tab open, the welcome screen shows the mark beside "notras" and the single-line tagline "write another note". The new-note button and search shortcut remain below it.

## Notes and files

- Notes live in one directory. It defaults to `~/notras` and settings changes it. The choice is stored in Tauri's `settings.json`.
- First launch creates the notes dir, `.notras/`, and `.notras/index.db`, then scans the folder.
- A note is a file whose extension is `md` or `markdown`, matched without regard to case, so `NOTE.MD` is a note.
- A folder is a directory. Any path segment starting with a dot is skipped, so `.notras/` never indexes itself. Scans skip symlinked files and directories, including a note whose parent became a symlink after indexing. Such notes are not read for mentions.
- The selected notes root may be a symlink. The app resolves it before reading, watching or granting attachment access. Existing symlinked paths beneath that root are refused for direct note operations and attachment writes. A symlinked index directory or database path prevents opening the library. Explicit external-file operations remain available.
- A new note is `untitled.md` in the notes root. A name already taken takes the next free `untitled-2`, then `untitled-3`. The suffixed name stays within 120 characters, with the base cut to make room.
- An explicit creation filename may include its `.md` extension in any letter case. Creating `entry.md` produces `entry.md`, with collision suffixes before the extension.
- Creating a note is atomic. Losing the race reports that a note already exists at that path, and leaves no partial file.
- A library path uses `/` separators with no empty, `.` or `..` components. A segment carries no `\`, `:` or null character, is not blank, and does not start with a dot. A folder name is at most 120 characters. Library mutation receipts use `/` separators on every platform.
- The title resolves from the leading `#` heading, then an imported frontmatter `title:`, then the filename stem. Existing frontmatter titles remain unchanged.
- Only the first non-blank line can be that heading, and it takes CommonMark's ATX shape: up to three spaces of indent, one `#`, then a space, a tab, or the end of the line. `##` never matches, and `# C#` keeps its trailing `#`.
- "rename note..." accepts a readable name and sets the leading heading, introducing it when absent. The filename is lowercased, with whitespace and invalid filename characters collapsed to hyphens, and truncated to 120 UTF-16 code units without splitting a Unicode character.
- Every heading edit inside notras requests a freshly derived filename, even when the edit restores the original text. An empty or removed heading leaves the filename alone. Opening, reading, searching, and external edits never request a rename.
- A taken filename receives the first available numeric suffix, starting at `-2`. The current file does not collide with itself. Each new heading edit recomputes the suffix from scratch. One undo restores the heading and filename together; if that filename has since been taken, restoration also uses an available suffix.
- Rename and move stage and sync a destination before publishing it without overwriting an existing file. A failed publication leaves the source unchanged. If source removal fails after publication, both files remain, the tab follows the destination, and the main window shows the source path and cleanup reason.
- Frontmatter reads three top-level keys: `pinned`, `tags` as an inline or block list, and `title` as read-only. Nested keys remain foreign metadata. Every other key survives a rewrite verbatim, including its position, and so does the closing delimiter the file used.
- A tag is trimmed, unquoted, stripped of `,`, `[` and `]`, and lowercased. Empty tags are dropped and duplicates collapse.
- "move to folder..." keeps the filename rather than the title, creates the folder if it is missing, and refuses a target that is taken.
- "delete note..." asks once, then removes the file. There is no trash.
- Frontmatter is not searchable. Only the title and the body reach the index.
- Every `[[wikilink]]` in a note is a row in the index: the note, the line as `grep -n` counts it, the text between the brackets as written, and the line itself. One inside a fence, indented code, inline code, an HTML block or comment, or between a matching pair of inline tags is not a row, which is where the editor shows text rather than a pill.
- A markdown link whose destination is a note is a row too, with its destination as written. A destination counts when it carries no scheme, is not an anchor or an absolute path, and ends in `.md` or `.markdown` before any `#` or `?`, whatever the case. These note destinations use `link` rows. Other rendered destinations use `destination` rows, including bare and angle-bracket autolinks, attachment links, and external URLs. Images and links inside code or an HTML pair do not count. Malformed or escaped wikilink openings do not suppress rendered autolinks. The index and the editor agree on one table of cases.

## Saving

- Typing starts a save 800ms after the last change.
- Losing window focus, unmounting the session, and quitting each flush too.
- Rich mode edits the body of the session document; source mode edits the whole document. Rename, pin, and tags also edit that document. Rapid tag additions and removals apply to the current document, retaining other tag edits made before the controls refresh or saving completes. Every save writes its complete contents.
- Switching editor modes preserves unsaved content, including source spelling that renders identically, and the shared undo history. Save completion cannot replace newer typing. A failed selection mapping does not prevent a valid document replacement from reaching the rich editor; the editor retains its transaction-mapped selection instead.
- A write goes to a temporary sibling, syncs, copies the original's permissions, and renames over. A save cannot recreate a file that was deleted. Replacement supports open readers whose sharing permissions allow it, including on Windows. Existing readers retain the original file; subsequent reads see the replacement. Failed publication cleans up its temporary file.
- Writes and folder moves are serialized per session. Rename changes the heading immediately; saving publishes the resulting content and filename. Further rename and move actions remain available while earlier work is pending. Later saves use the committed path.
- Rename is one undoable edit. It preserves the mounted editor and maps the selection through the heading change. A failed save retains the live document and reports the reason; retry saves the current document.
- A keystroke during a write returns the state to unsaved. Quit and update restart wait for queued operations and later edits, including a closing session's final flush.
- Direct reads and indexing obtain content and timestamps from the same opened file. An atomic replacement during a read cannot mix two files; concurrent in-place writes are not isolated. An invalid or unavailable modification time reports a failure instead of indexing zero.
- A committed file change remains saved when indexing fails. The main window shows a persistent warning naming the file and reason. The next index read waits for a complete recovery scan and reports a failure if recovery is incomplete. Waiting readers share the scan; direct file reads and saves can run between its steps. Direct file reads remain available. A committed capture clears and hides even when indexing reports a warning.
- A scan reports invalid file paths and continues indexing valid notes. Path-conversion failures defer stale-row deletion until a scan can convert all file paths. Indexed reads still reject an incomplete recovery.
- Index reconciliation reports unreadable database values as failures. Failed index deletion rolls back changes to the note's metadata, tags, links and search entry; it does not undo a committed file deletion.
- The save glyph in the title bar reads saved, unsaved, saving, or could not save. A tab whose save failed carries a dot of its own.

## External changes

- The watcher debounces at 300ms, so a file written by anything else reaches the app within about a second. A note appears in the palette under its own title rather than its filename.
- A change event names the files that changed, and only the tabs holding one of them re-read. An event naming nothing means the whole vault changed, and every tab re-reads.
- An external file's path is never named by a change event, so an external tab re-reads when the window regains focus.
- A clean session adopts a newer external document without writing or renaming it. The mounted editor remains in place, its selection maps through the change, and undo history resets at that external version.
- An external observation cannot replace unsaved work. Saves and folder moves defer file-read reconciliation, and results for a former path cannot replace the document.
- A dirty buffer wins. An external edit to a note with unsaved changes is not shown, and the next flush overwrites it.
- A tab whose file was deleted while its buffer was clean closes itself.
- A tab whose file was deleted while it held unsaved edits keeps the text, stops writing, and says the file is gone. Restoring the file clears the banner and the next flush carries what was typed while it was gone.
- A read that fails for any other reason leaves the tab's text alone and toasts once. Repeated failures do not stack a second toast. A tab that has never read shows the reason in its panel and offers to try again.
- A failure that stops the workspace from rendering shows what failed and why in place, and offers to try again.
- An error toast names what failed as its title and carries the reason, when the failure has one, as its description.
- The reason a filesystem failure carries is lowercase and names no error number: "permission denied", "no such file", "that path is a folder", "the volume is read-only", "the disk is full", and for any other kind the system's own words without their code.
- A failure the app did not anticipate reaches the user as "an unexpected error", and its cause goes to the log. Both sides write to one log file in the app's log folder, `~/Library/Logs/codes.jimmy.notras/notras.log` on macOS, which `pnpm dev` also prints.
- A refresh of data already on screen that fails toasts what could not refresh and why. The first read of anything reports through its own surface instead: the route error screen for the workspace, the pane for a tab.
- A save that failed shows why under "could not save", in the save glyph's tooltip and in the tab's dot.
- A search the index could not answer reads "could not search notes" over the reason in the palette, and offers no note to create from it.
- A launch that cannot proceed shows a dialog saying notras could not start and why, then exits. An index that cannot be opened is deleted and rebuilt from the files, which the log records.
- The watcher logs what it could not watch, index, or rescan, and a settings change that could not be saved reports so before the folder switches. Failed observation reconciliation emits no change event.
- The index skips a file whose mtime matches its stored row, so the app's own writes do not echo back.
- Deleting `.notras/index.db` and relaunching rebuilds it from the files. "reindex library" refreshes every note, including unchanged files, while retaining indexed rows until each note is refreshed. During a healthy scan, indexed queries use the complete version from before the scan and refresh after completion. Queries against a fresh or failed index wait for successful recovery. A partially indexed library cannot appear as empty, and a folder rescan cannot show both the old and new paths. File reads and saves can run between scan steps and while indexed queries execute. One large file can still delay another file operation. While indexed reads wait on a fresh or recovering index, the palette reads "indexing notes" and the welcome screen reads "indexing notes..." instead of an empty result or the generic loading text. A scan that fails reports its reason to the reads that waited on it.
- An older index schema is recreated on the first launch of a newer one and rebuilt by the startup scan, which the log records.

## Tabs

- Tabs sit in the title bar. Each holds its own editing session, undo history, and caret. Tab labels and overflow choices show the live document title, using the filename until the document loads. The tab strip and an available document remain usable while library lists are pending or failed.
- ⌘N, ⌘T, the strip's `+`, the tray's new note, the palette's new note, and the palette's create row all open a new note in a new tab.
- Opening a path that is already open activates the tab holding it rather than duplicating it.
- ⏎ in the palette replaces the tab that is showing. ⌘⏎ and ⌘-click open beside it. A link click replaces.
- ⌘W closes the showing tab and the tab on its right takes over, or the one on its left when it was last. Closing a background tab leaves the active one alone.
- Closing the last tab leaves the empty state, where ⌘E, ⌘⌥G, ⌘⌥⇧W and ⌘⇧Y do nothing, the status strip is hidden, and the title bar holds the strip's `+` alone. ⌘D still sets the writing mode, and the next note opened is already in it. Pressing and moving the bar beside it moves the window, and a double-click zooms.
- ⌘⇧T reopens the last closed tab in the slot it left. The stack holds ten, and closing the same file twice moves its one entry to the top.
- ⌘1 to ⌘8 select the nth tab and ⌘9 selects the last one. ⌃⇥ and ⌘⌥→ cycle forward, ⌃⇧⇥ and ⌘⌥← cycle back, and both wrap.
- ⌘⌥⇧← and ⌘⌥⇧→ move the tab itself, clamped at the ends.
- A pointer drag starts after 4px and reorders on release. Pressing a tab selects it first, and the close button never starts a drag.
- A lone tab does not reorder. Pressing and moving it moves the window, and double-clicking it zooms.
- Tabs that overflow the strip collapse into a count beside `+`, and picking one shows it.
- The tab context menu offers close, close others, close to the right, and copy path, acting on the tab it opened over. All four are also palette actions acting on the tab that is showing, and ⌘⌥⇧W closes the others.
- Copy path copies the file's full path, so a note carries the notes folder in front of it and an external file carries its own.
- A file opened through "Open With" from outside the notes dir is an external tab: labelled by its basename in mono, saved beside the original file, with in-app heading edits updating its filename, absent from the index, and carrying no pin, tags, rename, move, delete, or reveal. Its relative images do not render, its wikilinks do not navigate, and it counts no mentions. One inside the notes dir opens as the note it is, landing on the tab already holding it when one does.
- Quitting and relaunching restores the open tabs, which one was active, and each tab's caret. Scroll position, undo history, and source mode do not survive. A store that does not parse is discarded whole.
- An external tab restored for a file inside the notes dir comes back as that note, and drops out when the note is already open in another tab.
- With nothing to restore, the most recently updated note opens when its query completes. The welcome screen and new-note action remain available during that read, which says "indexing notes..." while the first scan runs. A tab change cancels this automatic opening, so a late result cannot replace the user's choice. A failed read shows its reason and a retry action.

## Search and the palette

- ⌘P toggles the palette over whatever is showing, in find mode. ⌘⇧P toggles it in actions mode. Pressing one while the other shows switches mode rather than closing.
- Find mode lists notes and never actions. Actions mode lists actions and never notes.
- Search runs on SQLite FTS5 over the title and the body, ranked pinned first, then by bm25, then by recency. With no query the palette lists notes by most recently updated, without prioritizing pins.
- Each term is stripped to letters, digits and `_`, then matched as a prefix. Terms are joined with AND.
- A hit carries a snippet of at most 24 tokens with the matched text highlighted.
- Search debounces at 150ms and returns at most 30 notes. The idle list shows 20.
- `#tag` and `folder:path` may appear anywhere alongside free text. All filters, including repeated filters, combine with AND before the 30-result cap. A folder includes its descendants; `folder:/` includes the notes root and its descendants. An unknown tag or folder returns nothing.
- Find mode keeps an "add filter" button below the results. It opens choices for folder, tag, mentions of a note, links from a note, phrase in prose, and link destination. Escape returns from these choices without changing the query. Incomplete tokens show suggestions. Folder suggestions include ancestors and subtree counts, with a "notes root" choice. Picking a suggestion replaces the token at the caret, or an unfinished token, and preserves other filters and free text. Resolved tokens show note results instead of a picker. Values accept quotes and escaped quotes or backslashes.
- A find that matches no note offers to create one named for the query, which opens in a new tab. Its filename is derived from what was typed, so `Q3 planning: draft` lands as `q3-planning-draft.md`, and a name already on disk gets a counter rather than overwriting. The row appears only after a completed, unfiltered free-text search returns no results. Pending searches offer no creation. Incomplete filters and failures show their own messages.
- `to:projects/atlas.md` finds notes mentioning that note through resolved internal links or its bare title. Existing duplicate-title resolution and self-reference exclusions apply. `from:projects/atlas.md` finds existing notes it explicitly links to, excluding itself and unresolved targets. Note pickers show titles and paths and insert canonical library-relative paths. An unresolved path returns nothing. Rust resolves relationship searches and returns complete results; free-text candidates remain uncapped until the filters have been applied.
- Each saved-library query reads one indexed version, including titles, tags, snippets, links and literal prose. External file changes appear after indexing; a query cannot combine earlier metadata with newer file contents. A query that finishes after a library switch rejects its old result.
- `mention:"Ada Lovelace"` finds the whole phrase in saved prose without regard to case, including headings and excluding frontmatter, code, HTML, and link spans. The phrase need not name a note, and punctuation-only phrases are searchable. ASCII phrases with letters or digits use FTS to narrow candidate files before literal matching, retaining files with non-ASCII bodies because Unicode word boundaries differ. Punctuation-only and non-ASCII phrases scan the saved library so tokenizer or Unicode case-folding differences cannot omit matches.
- `link:github.com` matches literal destination text without regard to case: note paths, attachments, external URLs, unresolved wikilinks, and rendered autolinks. Image sources do not match. Without free text, results show matching context when available; outgoing context names its source note.
- Palette search reads saved library content. A failed read shows its reason and a retry button, and never offers creation. While a changed query debounces or loads, the last displayed note rows stay visible at the same opacity and scroll position. Those rows cannot open through Enter, ⌘Enter, or a click, and those gestures are not queued. Results replace the previous rows together when the current query completes, with the first result selected and the list scrolled to the top. Refreshing the same query keeps its rows usable and preserves the choice while that note remains in the results. Clearing the input restores cached recent notes immediately; an uncached list shows loading until its read completes. A failed refresh retains cached rows beside the error. Responses and failures for an earlier query cannot replace the current display. An index still scanning shows "indexing notes" in place of "nothing found" and offers no creation.
- Filter suggestions and move choices show loading or a failure with retry until their data is available. These reads do not block the actions list. Both tag editors keep attached tags and typed choices available while suggestions are pending or failed, and do not label unknown counts as zero. The palette offers a typed tag as "add" because tagging does not require knowing whether the tag already exists elsewhere.
- The actions are find in note, new note, pin, edit tags, show mentions, rename note, move to folder, delete note, reveal in finder, focus mode, markdown source, graph view, close tab, close other tabs, close tabs to the right, copy path, reopen last closed tab, quick capture, settings, reindex library, and check for updates.
- Find in note needs an available editor, including an external file.
- New note, focus mode, reopen last closed tab, quick capture, settings, reindex library and check for updates are always listed. Pin, edit tags, show mentions, graph view, rename note, move to folder, delete note and reveal in finder need a note showing. Markdown source, close tab, close other tabs, close tabs to the right and copy path need a tab showing, so they reach an external file too.
- The writing-mode rows and graph view name what selecting them does: "turn on focus mode" while it is off, "turn off focus mode" while it is on.
- Escape or cancel in a delete, move, rename or tags sub-view returns to actions with an empty input. Closing by Escape, backdrop, or the opening shortcut starts a fresh query on the next opening. Rename selects the existing title. Deletion starts with cancel selected.
- Move filters folder paths without regard to case and preserves their spelling. It includes ancestor folders and subtree counts. Notes root appears only when it matches the query, and an existing folder is not offered as new.
- Action search matches the wording shown on the row, including "unpin note" and "turn on focus mode". The input has an accessible name for its current task. Attached tags expose their checked state independently of keyboard selection.
- Search, actions, filter choices, move, and tags share a 24rem palette height, capped to the available window height. Rename and delete fit their content. Typing and changes between results, loading, and empty states do not resize a list view. A search read that remains pending for 500ms shows a spinner in reserved space beside "add filter". The 150ms debounce stays quiet. The spinner disappears when the read settles, the query changes, or the view closes, and respects reduced motion.
- The palette keeps its input and filter button visible at the supported 480 by 360 minimum window. Its list scrolls within the available height. Long titles truncate with an ellipsis while folder context keeps its own space.
- An action that has a shortcut shows it on its row, read from the bindings the app has registered rather than restated: new note carries ⌘n and ⌘t, edit tags ⌘⇧y, show mentions ⌘⇧l, focus mode ⌘d, graph view ⌘⌥g, find in note ⌘f, markdown source ⌘e, close tab ⌘w, close other tabs ⌘⌥⇧w, reopen last closed tab ⌘⇧t, and settings ⌘,. The rest show none.
- Opening the palette, switching notes, and changing editor modes produce no shortcut-registry render warnings in the development build. Shortcut labels follow live registrations. Callbacks and enabled state change only when the owning React render commits; a suspended replacement keeps the previous behavior. Unmounting the owner removes its bindings.

## Find in a note

- ⌘F opens or focuses a floating find bar at the editor's upper-right. It searches the active unsaved buffer in rich text, raw source, external-file tabs, and quick capture. From graph view it returns to the editor. With no editor available, the palette action is absent.
- A single-line editor selection seeds the query. Otherwise the window's last query is reused. Query and open state stay in memory across tabs and rich/source changes; capture keeps separate state.
- Matching is literal, case-insensitive, and non-overlapping. Rich text matches across formatting within each text block, including code, table cells, link labels, and atomic wikilink titles. Source searches the entire raw file, including frontmatter.
- The bar shows `current / total`, previous, next, and close controls. Matches are highlighted and the active match has an outline. Searching and navigating preserve document content and undo history. Edits and undo recompute matches.
- Enter and Shift+Enter move forward and backward in the find input. ⌘G and ⌘⇧G do the same from the editor, wrap at either end, and reopen the last search when the bar is closed. Graph view uses ⌘⌥G.
- Escape closes find, clears its highlights, and focuses the active match or the previous caret when nothing matches. In capture, this Escape does not save or hide the window.
- While find is open, focus-mode dimming and typewriter scrolling are suspended. Existing focus-mode padding remains. Match navigation scrolls the editor viewport and leaves the window and floating bar stationary.

## The editor

- The editor is WYSIWYG over the file's markdown, and what lands on disk is the serializer's canonical GFM.
- ⌘E swaps to raw source and back, and the palette does too. The caret round-trips in both directions, and a serialization that diverges from a clean re-parse is discarded rather than written.
- A failed rich-editor selection conversion does not block valid document edits or saves. Invalid selection offsets do not reach the shared document.
- In source mode, Tab inserts two spaces and Shift-Tab outdents two.
- `/` opens the slash menu: heading 1, heading 2, heading 3, bullet list, numbered list, task list, quote, code block, table, divider, and today's date. The filter matches the label or the shorthand, so `/h1` finds heading 1.
- `[[` completes note titles, at most eight at a time. A wikilink renders as a pill and serializes back to `[[title]]`.
- A link activation waits for the note list when resolution is not yet available. A failed read reports "could not open note" and its reason without claiming the destination is missing. A newer link activation, switching away from the originating tab, or closing that session supersedes the pending action. Returning to that tab does not revive the action. Changes that leave the originating tab active, including background-tab closures and reordering, do not supersede it. A superseded result cannot navigate or show an obsolete failure.
- Clicking a pill resolves by title first, then by filename, preferring a note in the same folder, then by Unicode scalar path order so duplicate titles resolve identically across devices. A link matching nothing says so and creates nothing.
- The status strip counts the notes that mention the one showing, as `3 mentions` or `1 mention`, and shows nothing while none does. A mention is a wikilink or a markdown link in another note that resolves to this one the way a click would, or this note's title written there bare, so a note's links to itself and links that name no note count for nothing.
- A bare title counts when it stands as a whole word, without regard to case, outside links, code, HTML, and the heading that names the other note. A letter, digit or underscore on either side makes it part of a longer word, and a leading heading names the note even when imported frontmatter also has a title. The filename is not searched, and two notes sharing a title both count the same bare line.
- The count, ⌘⇧L, and "show mentions" in the palette open one list: a row per note reading `title · folder`, the line that mentions it beneath, starting on a word a little before the link or the title, and `+1` on a note that mentions it more than once. ⏎ opens the note in the showing tab, ⌘⏎ opens it beside, and esc closes.
- A link or a bare title written by anything else reaches the count within about a second.
- A read of the mentions that fails leaves the count absent and toasts why once, under "could not read mentions".
- A click on a link whose destination is a note opens that note in the showing tab. The destination resolves against the linking note's folder with `.` and `..` folded, exactly first and then without regard to case, and one that climbs above the notes folder or names no note says "no note at" the destination. Such a link reads as internal: every link on the surface draws the same underline at the same height and thickness, and the style says where it goes, dashed inside the library and solid out of it.
- ⌘⇧K adds or edits a link. A click opens one, and so does ⌘⇧O on the link at the caret, which is the way there without a mouse. Pointing at a link shows where it goes, and an edit button there opens the same popover ⌘⇧K does, changing the words and the url together. Only `file`, `ftp`, `http`, `https`, `mailto`, `obsidian` and `tel` open; any other scheme is refused with a message. A URL with no scheme gets `https://`.
- A click on an attachment link does not open the attachment.
- Dragging files onto the window copies each into `attachments/` and inserts a link into the tab that is showing. A name already taken becomes `stem-2.ext`. Spaces survive on disk and are percent-encoded in the link.
- An image extension inserts an image, anything else a link.
- Pasting an image saves `attachments/pasted-<epoch-ms>.png`.
- Pasting fenced markdown, with backticks or tildes, creates code blocks. HTML code blocks and code carrying VS Code or Cursor clipboard language metadata keep their code text and language, even when the text contains markdown punctuation. On macOS, native clipboard metadata also identifies these copies when the webview omits it, and identifies Zed copies as code blocks without a fence language. If native clipboard reading or custom paste parsing fails, an error toast appears and the original clipboard slice replaces the paste selection, preserving paste order. Pasting inside a code block inserts literal text. Other markdown-looking text pastes rich, and other text pastes plain. Copying out of the editor puts markdown on the clipboard.
- Tables are editable and start at two columns by three rows with a header. Task checkboxes are clickable and round-trip as `- [x]` and `- [ ]`.
- A table sizes to its content rather than the column. One too wide to fit scrolls sideways inside its own box, and the note does not move with it.
- Strikethrough takes one tilde or two, typed or read from a file, and the closing run may not follow a space. The serializer writes two, so `~x~` in a note written elsewhere saves back as `~~x~~`.
- A list nested under an ordered item indents to the marker's width, so `1. first` carries its child at three spaces. A child written at two spaces by an earlier build or another editor still opens nested and saves back at three.
- A literal `` ` ``, `*`, `_`, `[`, `]` or `~` in prose is written to the file as typed. It gains a backslash only where the note would otherwise read back as something else, and then the whole note is escaped.
- A code block carries a copy button and a language picker. Copy writes the whole block as fenced markdown with its current language. The picker fits its selected label with equal horizontal padding, lists Shiki's bundled languages, and preserves aliases and unsupported labels rather than rewriting them. Changing the language updates the saved fence language. Plain and unsupported languages remain unhighlighted, without automatic language guessing.
- Copying or saving a code block writes a backtick fence, or a tilde fence when its language label contains a backtick. The fence has at least three characters and is longer than any run of its chosen character in the content. Nested fence examples retain their literal text and language on reopening, and the prose and code following them retain their structure.
- Fenced code and Markdown source use the same regular-weight, upright syntax inks in both appearance modes. Imports, control flow, declarations, and types have distinct roles. Markdown highlights leading YAML frontmatter closed by `---` or `...`, including trailing spaces, and supported languages inside labeled code fences.
- Highlighting loads from packaged assets and works offline. Editing retokenizes changed code blocks and preserves mapped highlighting in unchanged blocks. Prose and selection edits do not retokenize unchanged code. A grammar may appear after the text, without moving the caret, changing note content, or adding an undo step. A loading failure leaves editing available and reports "could not highlight code"; reopening the editor retries loading.
- What the selection covers moves, widened to whole blocks. A caret in a paragraph means that paragraph, a selection across three means those three, and a caret anywhere in a list item means the item with any sublist under it.
- Pressing inside a selection and dragging moves it. A copy of what is held follows the pointer under a shadow, sitting below and right of it so the pointer and the mark stay clear, the source dims where it sits, a bar marks where the drop lands, and the cursor reads as grabbing for the length of the drag. A drag starts after 4px, and a press that never moves places the caret instead.
- What is highlighted is what moves. A selection inside one block drags the words and drops them at a text position, and a selection covering a block end to end or crossing into another drags the blocks. The copy hugs what it holds and wraps at the block's width at most.
- The mark is one bar for both kinds of drop, 2px wide and a line tall. For words it stands between characters. For blocks it stands at the start of the first line of the block they land before, and hangs below the block above where nothing follows: after the last block, after the last row or item of a container, and before a rule.
- Words dropped between blocks become a paragraph of their own. Words dropped into a code block lose their marks.
- A click inside a selection that never moves places the caret, and a repeated one selects instead: two clicks take the word, three take the block.
- What a block becomes follows where it lands. An item dropped among items of another kind takes that kind, a paragraph dropped between items becomes an item, and an item dropped outside every list becomes its own blocks. Moving the last item out of a list takes the list with it.
- A drop onto a block lands beside it rather than inside it, on the half of the block the pointer is over, so an item dropped on another item stays an item.
- Inside a table the unit is the row: a caret in any cell moves that whole row. A row stays in its own table, so a drop outside it is refused and shows no line, and a paragraph dragged over a table lands before or after it rather than inside.
- The header row does not move, and no row moves above it, since the first row is the one markdown writes as the header.
- ⌥↑ and ⌥↓ move it one sibling at a time, and the first item in a list steps out to sit before the list. A move is one undo step, and inside the editor these no longer jump the caret by paragraph.
- A block drag ends with the caret inside what moved and nothing highlighted, since its selection was only what the drag took hold of. A text drag ends with the dropped words selected, since that highlight covers exactly what moved.
- ⌥↑ and ⌥↓ keep whatever the selection was, so a caret stays a caret and blocks selected together stay selected and move together on the next press. A table row is the exception and ends with a caret the way a drag does, since the row is the unit whatever was selected.
- A keyboard move recentres the caret when focus mode is on; a drop does not.
- ⌘D toggles focus mode, which drops every block but the one holding the caret to 28% opacity and holds the caret's line at the editor's vertical centre. The status strip and the palette toggle it too.
- Scrolling by wheel or touch lifts the dim so the rest of the note reads normally, and typing, arrow travel, or a click restores it.
- Typing, deleting, undo, paste, and arrow-key travel recentre with a short glide. A click, a drag-selection, and scrolling by hand do not, and the next keystroke recentres.
- The caret types at its natural height until its line reaches the centre and locks there, so scrolling up settles at the note start with no blank above. The last lines reach the centre, toggling the mode does not shift the text, resizing the window keeps the caret's line at its anchor, and with reduce motion on the recentre is instant.
- Inside a code block the caret stays horizontally in view while the mode is on.
- The note's scrollbar is hidden while the mode is on.
- The status strip carries the word count and the reading time at 200 words a minute.
- Focus mode is app-wide rather than per tab and survives a relaunch.

## The graph

- ⌘⌥G swaps the showing tab between its note and its graph, and the strip's fourth view toggle and "graph view" in the palette do the same. An external tab has neither.
- The graph is the note in the centre, the notes that mention it fanned on the left, and the notes it links to fanned on the right, each once, in the order the mentions list and the note's own text give. A link that names no note draws a faint placeholder after the real links, on a dashed line, which nothing opens and the arrows skip. A link to itself draws nothing, and a note on both sides sits on the right with a dot at the end of its line.
- Past twelve on a side, the eleven most recently updated show and a `+N` pill carries the rest, placeholders filling what room the real links leave. On the left it opens the mentions list. On the right it opens a list of every note this one links to, each with the line that links it, then the targets that name no note, which open nothing. ⏎ or a click opens a note in place, ⌘⏎ beside.
- The note's folder, when it has one, and then its tags in frontmatter order sit along the top of the ring: a folder as its icon and name, a tag as `#tag`, each followed by how many things its own ring holds. More than five fold into a `+N` that lists them all.
- ⏎ or a click on a hub re-centres the graph on it without changing the tab. A tag's ring is every note carrying it. A folder's ring is the way up to its parent, then its subfolders, then its notes, in name order. Past twelve members, `+N` lists them all. ⏎ on a note there lands in it, and the ring re-forms around the note.
- Esc on a hub's ring returns to the note's ring; esc on the note's ring leaves the graph.
- ← and → walk the ring clockwise from the top, and ⏎ or a click opens the focused note in the showing tab with the graph staying on, re-centred on it. ⌘⏎ and ⌘-click open it beside and do the same. Landing puts focus on the centre, and ⏎ on the centre leaves the graph.
- esc leaves the graph and puts the caret back where it was. The editor is hidden rather than replaced, so the scroll, the caret and the undo history survive a visit.
- A note on screen before and after a hop glides to its new place over 0.15s with its line turning under it; with reduce motion on the move is instant.
- A pill's title truncates to the room the ring leaves it, so the graph fits the window at any width and never puts a scrollbar on it.
- With nothing on either side the centre stands alone over "no links yet, and nothing mentions it".
- A failed graph refresh keeps the last graph visible and reports the failure once for that note, under "could not read the graph".
- A read of the bare mentions that fails draws the graph from links alone and toasts why once, under "could not read the graph".

## Quick capture

- ⌘⇧N opens the capture window from any app, whether or not notras is in front. The tray and the palette offer the same.
- The window is 560 by 320, fixed, always on top, and out of the taskbar. Reopening it shows the one that exists.
- esc and ⌘⏎ save and hide. A double press saves once.
- The note lands in `inbox/` named `yyyy-MM-dd-HHmmss.md`, and a same-second collision takes the next free name.
- Capturing nothing writes nothing, and the window hides.
- A failed save keeps the jot on screen and says so.
- The capture window runs outside the router, so the palette and the tab shortcuts do not reach it. The editor's own keys and find in note do.

## The window and the system

- The main window opens at 960 by 720 and stops at 480 by 360.
- macOS draws an overlay title bar with the traffic lights inset, and the app draws a 36px drag region holding the tab strip, the save glyph, and the pin.
- The window itself never scrolls, including when content overflows or caret movement asks an ancestor to scroll. The note or source editor has one vertical scrollbar between the two bands. No outer scrollbar runs the full height of the window or crosses either band.
- The tray menu offers open notras, new note, quick capture, and quit.
- Closing either window hides it. Quitting is what exits.
- A quit is held until every open buffer has flushed. A buffer that could not write cancels the quit and says so. A buffer whose file is gone reports the quit as safe while still holding text, and its banner is the only warning.
- If the webview never answers, the quit goes through after 5 seconds.
- "Open With" opens each markdown file in its own tab, however many are picked at once: inside the notes dir as its note, outside as an external tab. A path that reaches the notes dir through a symlink counts as inside it. macOS only.
- Settings exposes the notes folder and launch at login. Changing the folder creates its `.notras/`, builds an index, restarts the watcher, and stores the choice.
- Rust owns index reads and writes. The webview sends typed operations and has no generic SQL command.
- A native panic stops a production build. It is not reported as an ordinary file failure, and interrupted native state is not reused.

## Updates

- A production build asks the release endpoint once on launch. It is silent when the app is current and silent when the check itself fails.
- An available version arrives as a toast naming it, with an install button and no timeout. Dismissing it declines.
- Install downloads, flushes every buffer, and relaunches into the new version. A buffer that could not write stops the relaunch, and the downloaded bundle applies at the next launch.
- "check for updates..." reports every outcome, including that update checks are off in development.
- A development build never reaches the updater.

## What is stored where

- The notes folder lives in Tauri's `settings.json`. Launch at login lives with the OS.
- The open tabs, the active tab, and each tab's caret live in `localStorage["tabs"]`. Focus mode lives in `localStorage["focus-mode"]` beside them.
- Pins, tags, and a `title:` key live in the note's frontmatter. Attachments live in `attachments/`.
- The index at `.notras/index.db` is derived and disposable. Bare mentions are never stored; they are found when a note is showing.
- The reopen stack, source mode, graph mode, undo history, and scroll position live in memory and do not survive a relaunch.
