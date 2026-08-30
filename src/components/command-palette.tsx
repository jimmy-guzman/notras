import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  DownloadIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderInputIcon,
  FolderSearchIcon,
  HashIcon,
  KeyboardIcon,
  PencilIcon,
  PinIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  TagPlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useNoteTags } from "@/components/notes/use-note-tags";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { toast } from "@/components/ui/toast";
import type { NoteMeta } from "@/core/notes";
import { filenameFromTitle } from "@/core/notes";
import { createNote } from "@/data/create-note";
import { deleteNote } from "@/data/delete-note";
import { getNotes } from "@/data/get-notes";
import { moveNote } from "@/data/move-note";
import { setNotePinned } from "@/data/pin-note";
import { reindexAll } from "@/data/reindex";
import { retitleNote } from "@/data/retitle-note";
import { togglePref, usePref } from "@/lib/prefs";
import {
  closeNoteTab,
  openNote as openInTab,
  renameTab,
  useTabState,
} from "@/lib/tabs/store";
import { tabId } from "@/lib/tabs/tab";
import { errorMessage } from "@/lib/ui/failure";
import { findUpdate, offerUpdate, updatesSupported } from "@/lib/updater";
import { getSnippetParts } from "@/lib/utils/fts-snippet";
import { parseTagQuery } from "@/lib/utils/tag-query";

function Snippet({ snippet }: { snippet: string }) {
  return (
    <span className="truncate text-muted-foreground text-xs">
      {getSnippetParts(snippet).map((part) =>
        part.match ? (
          <mark
            className="rounded-xs bg-primary/20 text-foreground"
            key={part.id}
          >
            {part.text}
          </mark>
        ) : (
          <span key={part.id}>{part.text}</span>
        )
      )}
    </span>
  );
}

function reportActionFailure(error: unknown) {
  toast.add({
    title: errorMessage(error, "something went wrong"),
    type: "error",
  });
}

const VISIBLE_TAGS = 3;

// `CommandItem` appends its own `ml-auto` checkmark, so a second `ml-auto`
// here would split the free space with it and let the label's width shift the
// count. A flex-1 label and a fixed column keep the digits in one place.
const COUNT_CLASS =
  "w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums";

function tagLabel(tags: string[]) {
  const shown = tags
    .slice(0, VISIBLE_TAGS)
    .map((tag) => `#${tag}`)
    .join(" ");
  const hidden = tags.length - VISIBLE_TAGS;

  return hidden > 0 ? `${shown} +${hidden}` : shown;
}

interface NoteItemProps {
  note: NoteMeta;
  onSelect: (path: string) => void;
}

function NoteItem({ note, onSelect }: NoteItemProps) {
  const select = useCallback(() => {
    onSelect(note.path);
  }, [note.path, onSelect]);

  return (
    <CommandItem onSelect={select} value={note.path}>
      <FileTextIcon />
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 truncate">
          {note.title}
          {/* In a text run, not the row's icon slot, so it stays 12px (`D51`). */}
          {note.pinned ? <PinIcon className="size-3 opacity-60" /> : null}
          {note.folder === "" ? null : (
            <span className="text-muted-foreground text-xs">
              · {note.folder}
            </span>
          )}
          {note.tags.length === 0 ? null : (
            <span className="truncate text-muted-foreground text-xs">
              · {tagLabel(note.tags)}
            </span>
          )}
        </span>
        {note.snippet === null ? null : <Snippet snippet={note.snippet} />}
      </div>
    </CommandItem>
  );
}

interface FolderItemProps {
  count: number;
  folder: string;
  onMove: (folder: string) => void;
}

function FolderItem({ count, folder, onMove }: FolderItemProps) {
  const move = useCallback(() => {
    onMove(folder);
  }, [folder, onMove]);

  return (
    <CommandItem onSelect={move} value={`move-${folder}`}>
      <FolderIcon />
      <span className="flex-1 truncate">{folder}</span>
      <span className={COUNT_CLASS}>{count}</span>
    </CommandItem>
  );
}

interface TagChoiceItemProps {
  attached: boolean;
  count: number;
  name: string;
  onToggle: (name: string, attached: boolean) => void;
}

function TagChoiceItem({
  attached,
  count,
  name,
  onToggle,
}: TagChoiceItemProps) {
  const toggle = useCallback(() => {
    onToggle(name, attached);
  }, [attached, name, onToggle]);

  return (
    <CommandItem
      data-checked={attached}
      onSelect={toggle}
      value={`tag-${name}`}
    >
      <HashIcon />
      <span className="flex-1 truncate">{name}</span>
      <span className={COUNT_CLASS}>{count}</span>
    </CommandItem>
  );
}

interface TagFilterItemProps {
  count: number;
  name: string;
  onPick: (name: string) => void;
}

function TagFilterItem({ count, name, onPick }: TagFilterItemProps) {
  const pick = useCallback(() => {
    onPick(name);
  }, [name, onPick]);

  return (
    <CommandItem onSelect={pick} value={`tag-${name}`}>
      <HashIcon />
      <span className="flex-1 truncate">{name}</span>
      <span className={COUNT_CLASS}>{count}</span>
    </CommandItem>
  );
}

interface DeleteViewProps {
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}

function DeleteView({ onCancel, onConfirm, title }: DeleteViewProps) {
  return (
    <CommandGroup heading={`delete "${title}"?`}>
      <CommandItem onSelect={onConfirm} value="confirm-delete">
        <Trash2Icon className="text-destructive" />
        delete forever
      </CommandItem>
      <CommandItem onSelect={onCancel} value="cancel-delete">
        cancel
      </CommandItem>
    </CommandGroup>
  );
}

interface MoveViewProps {
  folders: { count: number; folder: string }[];
  onCancel: () => void;
  onMove: (folder: string) => void;
  onMoveToNewFolder: () => void;
  onMoveToRoot: () => void;
  query: string;
}

function MoveView({
  folders,
  onCancel,
  onMove,
  onMoveToNewFolder,
  onMoveToRoot,
  query,
}: MoveViewProps) {
  const draftFolder = query.trim().toLowerCase();

  return (
    <CommandGroup heading="move to">
      <CommandItem onSelect={onMoveToRoot} value="move-root">
        <FolderIcon />
        notes root
      </CommandItem>
      {folders
        .filter(({ folder }) => folder.includes(draftFolder))
        .map(({ count, folder }) => (
          <FolderItem
            count={count}
            folder={folder}
            key={folder}
            onMove={onMove}
          />
        ))}
      {draftFolder === "" ? null : (
        <CommandItem onSelect={onMoveToNewFolder} value="move-new">
          <FolderInputIcon />
          new folder "{draftFolder}"
        </CommandItem>
      )}
      <CommandItem onSelect={onCancel} value="cancel-move">
        cancel
      </CommandItem>
    </CommandGroup>
  );
}

interface RenameViewProps {
  onCancel: () => void;
  onConfirm: () => void;
  query: string;
  title: string;
}

function RenameView({ onCancel, onConfirm, query, title }: RenameViewProps) {
  const draftTitle = query.trim();

  return (
    <CommandGroup heading={`rename "${title}"`}>
      {draftTitle === "" ? null : (
        <CommandItem onSelect={onConfirm} value="confirm-rename">
          <PencilIcon />
          <span className="truncate">
            rename to "{draftTitle}"
            {/* The filename is derived, so it is shown, not hidden. */}
            <span className="text-muted-foreground">
              {" · "}
              {filenameFromTitle(draftTitle)}.md
            </span>
          </span>
        </CommandItem>
      )}
      <CommandItem onSelect={onCancel} value="cancel-rename">
        cancel
      </CommandItem>
    </CommandGroup>
  );
}

interface TagsViewProps {
  attached: string[];
  choices: string[];
  counts: Map<string, number>;
  draftTag: string;
  onCreate: () => void;
  onDone: () => void;
  onToggle: (name: string, attached: boolean) => void;
  title: string;
}

function TagsView({
  attached,
  choices,
  counts,
  draftTag,
  onCreate,
  onDone,
  onToggle,
  title,
}: TagsViewProps) {
  return (
    <CommandGroup heading={`tags for "${title}"`}>
      {choices.map((name) => (
        <TagChoiceItem
          attached={attached.includes(name)}
          count={counts.get(name) ?? 0}
          key={name}
          name={name}
          onToggle={onToggle}
        />
      ))}
      {draftTag === "" || choices.includes(draftTag) ? null : (
        <CommandItem onSelect={onCreate} value="tag-new">
          <TagPlusIcon />
          create "{draftTag}"
        </CommandItem>
      )}
      <CommandItem onSelect={onDone} value="cancel-tags">
        done
      </CommandItem>
    </CommandGroup>
  );
}

function typewriterActionText(enabled: boolean) {
  return enabled
    ? "turn off typewriter scrolling"
    : "turn on typewriter scrolling";
}

type PaletteView = "delete" | "move" | "rename" | "root" | "tags";

interface CommandPaletteProps {
  allTags: { count: number; tag: string }[];
  folders: { count: number; folder: string }[];
  notes: NoteMeta[];
  notesDir: string;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  open: boolean;
  tag?: string;
}

export function CommandPalette({
  allTags,
  folders,
  notes,
  notesDir,
  onOpenChange,
  onOpenSettings,
  open,
  tag,
}: CommandPaletteProps) {
  const { activeId, tabs } = useTabState();
  // Note actions act on the tab that is showing, and only when it holds a note:
  // an external file carries no frontmatter to pin, tag, rename or move.
  const activeTab = tabs.find((tab) => tabId(tab) === activeId);
  const currentPath = activeTab?.kind === "note" ? activeTab.path : undefined;
  const currentNote = notes.find((note) => note.path === currentPath);
  // cmdk's `onSelect` carries no event, so the modifier is read off the
  // gesture that triggered it, in the capture phase to beat cmdk's own handler.
  const newTabRef = useRef(false);

  // Empty path is unreachable: the tags view is gated on a current note.
  const noteTags = useNoteTags(
    currentNote?.path ?? "",
    currentNote?.tags ?? []
  );

  // A tag chip navigates with `?tag=`, which is what opens the palette. The
  // parent keys this component on the tag, so the seed applies once per tag
  // and typing afterwards is never overwritten.
  const [query, setQuery] = useState(tag === undefined ? "" : `#${tag} `);
  const [view, setView] = useState<PaletteView>("root");
  const [results, setResults] = useState<NoteMeta[] | null>(null);

  // Only the newest search may write results: two in-flight queries can
  // resolve out of order, and a slow "a" must not overwrite "abc". The counter
  // advances when the input changes rather than when the debounced call fires,
  // so a request already in flight is stale from the next keystroke on and not
  // only from the moment its successor starts.
  const latestSearchRef = useRef(0);

  const tagCounts = new Map(
    allTags.map(({ count, tag: name }) => [name, count])
  );
  const knownTags = new Set(tagCounts.keys());

  // Tag filtering is an indexed exact match that ANDs with full-text search,
  // so both paths run the same query and only differ in what they pass.
  const search = useDebouncedCallback(
    async (value: string, request: number) => {
      const parsed = parseTagQuery(value);
      const filters: { query: string; tag?: string } =
        parsed === undefined
          ? { query: value.trim() }
          : { query: parsed.query, tag: parsed.tag };

      if (
        filters.query === "" &&
        (filters.tag === undefined || !knownTags.has(filters.tag))
      ) {
        setResults(null);

        return;
      }

      try {
        const found = await getNotes({ limit: 30, ...filters });

        if (latestSearchRef.current === request) {
          setResults(found);
        }
      } catch {
        if (latestSearchRef.current === request) {
          setResults([]);
        }
      }
    },
    150
  );

  const updateQuery = useCallback(
    (value: string) => {
      latestSearchRef.current += 1;
      setQuery(value);
      search(value, latestSearchRef.current);
    },
    [search]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery("");
        setView("root");
        setResults(null);
      }

      onOpenChange(next);
    },
    [onOpenChange]
  );

  useEffect(() => {
    if (tag !== undefined) {
      latestSearchRef.current += 1;
      search(`#${tag} `, latestSearchRef.current);
    }
  }, [search, tag]);

  const tagQuery = parseTagQuery(query);
  const visibleNotes = (() => {
    if (tagQuery !== undefined && !knownTags.has(tagQuery.tag)) {
      return [];
    }

    return results ?? notes.slice(0, 20);
  })();

  const close = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  const backToRoot = useCallback(() => {
    setView("root");
  }, []);

  const trackNewTab = useCallback(
    (event: React.KeyboardEvent | React.MouseEvent) => {
      newTabRef.current = event.metaKey || event.ctrlKey;
    },
    []
  );

  const openNote = useCallback(
    (path: string) => {
      const newTab = newTabRef.current;

      newTabRef.current = false;
      close();
      openInTab(path, newTab);
    },
    [close]
  );

  const runAction = useCallback(
    (action: () => Promise<void>) => {
      close();

      try {
        action().catch(reportActionFailure);
      } catch (error) {
        reportActionFailure(error);
      }
    },
    [close]
  );

  // A tag the note carries may not be in the index yet, so the choices are the
  // union rather than the index alone.
  const draftTag = query.trim().toLowerCase();
  const tagChoices = [...new Set([...knownTags, ...noteTags.tags])]
    .toSorted()
    .filter((name) => name.includes(draftTag));

  // Actions match on the free text, so they stay reachable inside a tag
  // filter rather than disappearing the moment a `#` is typed.
  const matchesQuery = (label: string) => {
    const text = tagQuery === undefined ? query.trim() : tagQuery.query;

    return label.toLowerCase().includes(text.toLowerCase());
  };

  const confirmDelete = useCallback(() => {
    if (currentNote === undefined) {
      return;
    }

    runAction(async () => {
      await deleteNote(currentNote.path);
      closeNoteTab(currentNote.path);
      toast.add({ title: "note deleted", type: "success" });
    });
  }, [currentNote, runAction]);

  const moveToFolder = useCallback(
    (folder: string) => {
      if (currentNote === undefined) {
        return;
      }

      runAction(async () => {
        const next = await moveNote(currentNote.path, folder);

        renameTab(currentNote.path, next);
      });
    },
    [currentNote, runAction]
  );

  const moveToNotesRoot = useCallback(() => {
    moveToFolder("");
  }, [moveToFolder]);

  const moveToNewFolder = useCallback(() => {
    moveToFolder(query.trim().toLowerCase());
  }, [moveToFolder, query]);

  const confirmRename = useCallback(() => {
    if (currentNote === undefined) {
      return;
    }

    runAction(async () => {
      const next = await retitleNote(currentNote.path, query.trim());

      renameTab(currentNote.path, next);
    });
  }, [currentNote, query, runAction]);

  const toggleTag = useCallback(
    (name: string, attached: boolean) => {
      noteTags.changeTags(
        attached
          ? noteTags.tags.filter((existing) => existing !== name)
          : [...noteTags.tags, name]
      );
    },
    [noteTags]
  );

  const createTag = useCallback(() => {
    setQuery("");
    noteTags.changeTags([...noteTags.tags, draftTag]);
  }, [draftTag, noteTags]);

  const filterByTag = useCallback(
    (name: string) => {
      updateQuery(`#${name} `);
    },
    [updateQuery]
  );

  const newNote = useCallback(() => {
    runAction(async () => {
      const path = await createNote();

      openInTab(path, true);
    });
  }, [runAction]);

  const togglePin = useCallback(() => {
    if (currentNote === undefined) {
      return;
    }

    runAction(() => setNotePinned(currentNote.path, !currentNote.pinned));
  }, [currentNote, runAction]);

  const startEditTags = useCallback(() => {
    setQuery("");
    setView("tags");
  }, []);

  const startRename = useCallback(() => {
    setQuery(currentNote?.title ?? "");
    setView("rename");
  }, [currentNote]);

  const startMove = useCallback(() => {
    setQuery("");
    setView("move");
  }, []);

  const startDelete = useCallback(() => {
    setView("delete");
  }, []);

  const revealInFinder = useCallback(() => {
    if (currentNote === undefined) {
      return;
    }

    runAction(() => revealItemInDir(`${notesDir}/${currentNote.path}`));
  }, [currentNote, notesDir, runAction]);

  const openSettings = useCallback(() => {
    close();
    onOpenSettings();
  }, [close, onOpenSettings]);

  const typewriterEnabled = usePref("typewriter");

  const toggleTypewriter = useCallback(() => {
    close();
    togglePref("typewriter");
  }, [close]);

  const reindex = useCallback(() => {
    runAction(async () => {
      await reindexAll();
      toast.add({ title: "library reindexed", type: "success" });
    });
  }, [runAction]);

  // Unlike the launch check, this one was asked for, so it reports either way,
  // including the way a development build cannot report on: it never ran.
  const checkForUpdates = useCallback(() => {
    runAction(async () => {
      if (!updatesSupported()) {
        toast.add({ title: "update checks are off in development" });

        return;
      }

      const update = await findUpdate();

      if (update === null) {
        toast.add({ title: "notras is up to date", type: "success" });

        return;
      }

      offerUpdate(update);
    });
  }, [runAction]);

  const actions = [
    {
      Icon: FilePlusIcon,
      label: "new note",
      needsNote: false,
      onSelect: newNote,
      text: "new note",
      value: "new-note",
    },
    {
      Icon: PinIcon,
      label: "pin",
      needsNote: true,
      onSelect: togglePin,
      text: currentNote?.pinned ? "unpin note" : "pin note",
      value: "toggle-pin",
    },
    {
      Icon: TagPlusIcon,
      label: "edit tags",
      needsNote: true,
      onSelect: startEditTags,
      text: "edit tags...",
      value: "edit-tags",
    },
    {
      Icon: PencilIcon,
      label: "rename note",
      needsNote: true,
      onSelect: startRename,
      text: "rename note...",
      value: "rename-note",
    },
    {
      Icon: FolderInputIcon,
      label: "move to folder",
      needsNote: true,
      onSelect: startMove,
      text: "move to folder...",
      value: "move-note",
    },
    {
      Icon: Trash2Icon,
      label: "delete note",
      needsNote: true,
      onSelect: startDelete,
      text: "delete note...",
      value: "delete-note",
    },
    {
      Icon: FolderSearchIcon,
      label: "reveal in finder",
      needsNote: true,
      onSelect: revealInFinder,
      text: "reveal in finder",
      value: "reveal-in-finder",
    },
    {
      Icon: KeyboardIcon,
      label: "typewriter scrolling",
      needsNote: true,
      onSelect: toggleTypewriter,
      text: typewriterActionText(typewriterEnabled),
      value: "toggle-typewriter",
    },
    {
      Icon: SettingsIcon,
      label: "settings",
      needsNote: false,
      onSelect: openSettings,
      text: "settings",
      value: "settings",
    },
    {
      Icon: RefreshCwIcon,
      label: "reindex library",
      needsNote: false,
      onSelect: reindex,
      text: "reindex library",
      value: "reindex",
    },
    {
      Icon: DownloadIcon,
      label: "check for updates",
      needsNote: false,
      onSelect: checkForUpdates,
      text: "check for updates...",
      value: "check-for-updates",
    },
  ];

  return (
    <CommandDialog
      description="search notes and run actions"
      onOpenChange={handleOpenChange}
      open={open}
      title="command palette"
    >
      <Command
        onKeyDownCapture={trackNewTab}
        onMouseDownCapture={trackNewTab}
        shouldFilter={false}
      >
        <CommandInput
          onValueChange={updateQuery}
          placeholder={
            {
              delete: "search notes, # for tags...",
              move: "move to folder... (type a new name to create it)",
              rename: "new title...",
              root: "search notes, # for tags...",
              tags: "search notes, # for tags...",
            }[view]
          }
          value={query}
        />
        <CommandList>
          {currentNote === undefined ? null : (
            <>
              {view === "delete" ? (
                <DeleteView
                  onCancel={backToRoot}
                  onConfirm={confirmDelete}
                  title={currentNote.title}
                />
              ) : null}
              {view === "move" ? (
                <MoveView
                  folders={folders}
                  onCancel={backToRoot}
                  onMove={moveToFolder}
                  onMoveToNewFolder={moveToNewFolder}
                  onMoveToRoot={moveToNotesRoot}
                  query={query}
                />
              ) : null}
              {view === "rename" ? (
                <RenameView
                  onCancel={backToRoot}
                  onConfirm={confirmRename}
                  query={query}
                  title={currentNote.title}
                />
              ) : null}
              {view === "tags" ? (
                <TagsView
                  attached={noteTags.tags}
                  choices={tagChoices}
                  counts={tagCounts}
                  draftTag={draftTag}
                  onCreate={createTag}
                  onDone={backToRoot}
                  onToggle={toggleTag}
                  title={currentNote.title}
                />
              ) : null}
            </>
          )}

          {view === "root" ? (
            <>
              <CommandEmpty>
                <p className="text-muted-foreground">nothing found</p>
                <p className="text-faint">start with # to search by tag</p>
              </CommandEmpty>
              {tagQuery?.query === "" ? (
                <CommandGroup heading="tags">
                  {allTags
                    .filter(({ tag: name }) => name.includes(tagQuery.tag))
                    .map(({ count, tag: name }) => (
                      <TagFilterItem
                        count={count}
                        key={name}
                        name={name}
                        onPick={filterByTag}
                      />
                    ))}
                </CommandGroup>
              ) : null}
              <CommandGroup heading="notes">
                {visibleNotes.map((note) => (
                  <NoteItem key={note.path} note={note} onSelect={openNote} />
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="actions">
                {actions
                  .filter(
                    (action) =>
                      (!action.needsNote || currentNote !== undefined) &&
                      matchesQuery(action.label)
                  )
                  .map(({ Icon, onSelect, text, value }) => (
                    <CommandItem key={value} onSelect={onSelect} value={value}>
                      <Icon />
                      {text}
                    </CommandItem>
                  ))}
                {matchesQuery("search") && query.trim() === "" ? (
                  <CommandItem disabled value="search-hint">
                    <SearchIcon />
                    <span className="text-muted-foreground">
                      type to search all notes
                    </span>
                  </CommandItem>
                ) : null}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
