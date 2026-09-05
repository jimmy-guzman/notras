import { useDebouncedValue } from "@tanstack/react-pacer";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
  type LucideIcon,
  PencilIcon,
  PinIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  TagPlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Chord } from "@/components/chord";
import { useNoteTags } from "@/components/notes/use-note-tags";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import type { NoteMeta } from "@/core/notes";
import { filenameFromTitle } from "@/core/notes";
import { createNote } from "@/data/create-note";
import { deleteNote } from "@/data/delete-note";
import { moveNote } from "@/data/move-note";
import { setNotePinned } from "@/data/pin-note";
import { noteQueries } from "@/data/queries";
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
import { reasonOf } from "@/lib/ui/failure";
import { useChordsByName } from "@/lib/ui/shortcuts";
import { findUpdate, offerUpdate, updatesSupported } from "@/lib/updater";
import { getSnippetParts } from "@/lib/utils/fts-snippet";
import { parseTagQuery, type TagQuery } from "@/lib/utils/tag-query";

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

/** Which door opened the palette: ⌘P finds a note, ⌘⇧P runs an action. */
export type PaletteMode = "actions" | "find";

type PaletteView = "actions" | "delete" | "find" | "move" | "rename" | "tags";

interface PaletteAction {
  Icon: LucideIcon;
  label: string;
  needsNote: boolean;
  onSelect: () => void;
  text: string;
  value: string;
}

interface ActionsViewProps {
  actions: PaletteAction[];
  chordsByName: ReturnType<typeof useChordsByName>;
}

function ActionsView({ actions, chordsByName }: ActionsViewProps) {
  return (
    <>
      <CommandEmpty>
        <Empty className="p-6">
          <EmptyHeader>
            <EmptyTitle>nothing found</EmptyTitle>
            <EmptyDescription>
              <Chord hotkey="Mod+P" /> to search notes
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CommandEmpty>
      <CommandGroup heading="actions">
        {actions.map(({ Icon, label, onSelect, text, value }) => {
          const chords = chordsByName.get(label);

          return (
            <CommandItem key={value} onSelect={onSelect} value={value}>
              <Icon />
              {text}
              {chords === undefined ? null : (
                <CommandShortcut>
                  {chords.map(({ hotkey, id }) => (
                    // A selected row is `bg-muted`, which the chip otherwise
                    // matches exactly and disappears into.
                    <Chord
                      className="tracking-normal group-data-selected/command-item:bg-background"
                      hotkey={hotkey}
                      key={id}
                    />
                  ))}
                </CommandShortcut>
              )}
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}

interface FindViewProps {
  allTags: { count: number; tag: string }[];
  notes: NoteMeta[];
  onCreate: () => void;
  onFilterTag: (name: string) => void;
  onSelectNote: (path: string) => void;
  query: string;
  /** Why the index could not answer, when it could not. */
  searchError: Error | null;
  tagQuery?: TagQuery;
}

function FindView({
  allTags,
  notes,
  onCreate,
  onFilterTag,
  onSelectNote,
  query,
  searchError,
  tagQuery,
}: FindViewProps) {
  const draftTitle = query.trim();
  // A search that found nothing is a dead end unless it can become a note.
  // Only a plain one: naming a note from `#work foo` would have to tag it too.
  // One the index could not run found nothing either, and offers nothing.
  const offerCreate =
    searchError === null &&
    notes.length === 0 &&
    draftTitle !== "" &&
    tagQuery === undefined;
  const emptyDescription =
    searchError === null
      ? "start with # to search by tag"
      : reasonOf(searchError);

  return (
    <>
      <CommandEmpty>
        <Empty className="p-6">
          <EmptyHeader>
            <EmptyTitle>
              {searchError === null
                ? "nothing found"
                : "could not search notes"}
            </EmptyTitle>
            {emptyDescription === undefined ? null : (
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
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
                onPick={onFilterTag}
              />
            ))}
        </CommandGroup>
      ) : null}
      <CommandGroup heading="notes">
        {notes.map((note) => (
          <NoteItem key={note.path} note={note} onSelect={onSelectNote} />
        ))}
        {offerCreate ? (
          <CommandItem onSelect={onCreate} value="create-note">
            <FilePlusIcon />
            <span className="truncate">
              create "{draftTitle}"
              {/* The filename is derived, so it is shown, not hidden. */}
              <span className="text-muted-foreground">
                {" · "}
                {filenameFromTitle(draftTitle)}.md
              </span>
            </span>
          </CommandItem>
        ) : null}
      </CommandGroup>
      {draftTitle === "" ? (
        <CommandItem disabled value="search-hint">
          <SearchIcon />
          <div className="flex min-w-0 flex-col">
            <span className="text-muted-foreground">
              type to search all notes
            </span>
            <span className="text-faint">
              <Chord hotkey="Mod+Shift+P" /> for actions
            </span>
          </div>
        </CommandItem>
      ) : null}
    </>
  );
}

/**
 * What the input asks the index for, or nothing when it asks for everything.
 *
 * A tag is an indexed exact match that ANDs with full-text search, so both
 * paths run one query and differ only in what they pass.
 */
function searchFiltersFor(value: string, knownTags: Set<string>) {
  const parsed = parseTagQuery(value);
  const filters: { query: string; tag?: string } =
    parsed === undefined
      ? { query: value.trim() }
      : { query: parsed.query, tag: parsed.tag };

  if (
    filters.query === "" &&
    (filters.tag === undefined || !knownTags.has(filters.tag))
  ) {
    return;
  }

  return { limit: 30, ...filters };
}

interface CommandPaletteProps {
  allTags: { count: number; tag: string }[];
  folders: { count: number; folder: string }[];
  mode: PaletteMode;
  notes: NoteMeta[];
  notesDir: string;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  open: boolean;
  tag?: string;
}

/** The rows under "notes": what the index answered, or the recent ones. */
function useVisibleNotes(
  query: string,
  view: PaletteView,
  knownTags: Set<string>,
  notes: NoteMeta[]
) {
  const [debouncedQuery] = useDebouncedValue(query, { wait: 150 });
  // The list only renders under the root view, and the other views repurpose
  // the input, so nothing they hold should reach the index.
  const filters =
    view === "find" ? searchFiltersFor(debouncedQuery, knownTags) : undefined;
  // The filters are the key, so a slow "a" resolving after "abc" lands in its
  // own cache entry and never reaches the screen.
  const { data: results, error } = useQuery({
    ...noteQueries.list(filters),
    enabled: filters !== undefined,
    placeholderData: keepPreviousData,
  });
  const tagQuery = parseTagQuery(query);

  if (tagQuery !== undefined && !knownTags.has(tagQuery.tag)) {
    return { error: null, notes: [] };
  }

  // Asking for nothing builds the key the root loader already primed, and a
  // disabled query still reads the cache, so its full list would land here.
  if (filters === undefined) {
    return { error: null, notes: notes.slice(0, 20) };
  }

  if (error !== null) {
    return { error, notes: [] };
  }

  return { error: null, notes: results ?? notes.slice(0, 20) };
}

export function CommandPalette({
  allTags,
  folders,
  mode,
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
  const chordsByName = useChordsByName();
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
  // parent keys this component on the tag and the mode, so the seed applies
  // once per tag and typing afterwards is never overwritten. Only find reads
  // a tag: switching to actions over an open filter starts on an empty input.
  const [query, setQuery] = useState(
    mode === "find" && tag !== undefined ? `#${tag} ` : ""
  );
  const [view, setView] = useState<PaletteView>(mode);
  const tagCounts = new Map(
    allTags.map(({ count, tag: name }) => [name, count])
  );
  const knownTags = new Set(tagCounts.keys());

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery("");
        setView(mode);
      }

      onOpenChange(next);
    },
    [mode, onOpenChange]
  );

  const tagQuery = parseTagQuery(query);
  const { error: searchError, notes: visibleNotes } = useVisibleNotes(
    query,
    view,
    knownTags,
    notes
  );

  const close = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  const backToActions = useCallback(() => {
    setQuery("");
    setView("actions");
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
    async (what: string, action: () => Promise<void>) => {
      close();

      try {
        await action();
      } catch (error) {
        toast.add({ description: reasonOf(error), title: what, type: "error" });
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

  const matchesQuery = (label: string) =>
    label.toLowerCase().includes(query.trim().toLowerCase());

  const confirmDelete = useCallback(() => {
    if (currentNote === undefined) {
      return;
    }

    runAction("could not delete note", async () => {
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

      runAction("could not move note", async () => {
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

    runAction("could not rename note", async () => {
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

  const filterByTag = useCallback((name: string) => {
    setQuery(`#${name} `);
  }, []);

  const newNote = useCallback(() => {
    runAction("could not create note", async () => {
      const path = await createNote();

      openInTab(path, true);
    });
  }, [runAction]);

  // `create` de-duplicates by appending a counter, so a stale index or a
  // title that differs from its filename never overwrites the existing note.
  const createFromQuery = useCallback(() => {
    const title = query.trim();

    runAction("could not create note", async () => {
      const path = await createNote({ filename: filenameFromTitle(title) });

      openInTab(path, true);
    });
  }, [query, runAction]);

  const togglePin = useCallback(() => {
    if (currentNote === undefined) {
      return;
    }

    runAction("could not update pin", () =>
      setNotePinned(currentNote.path, !currentNote.pinned)
    );
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

    runAction("could not reveal note", () =>
      revealItemInDir(`${notesDir}/${currentNote.path}`)
    );
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
    runAction("could not reindex", async () => {
      await reindexAll();
      toast.add({ title: "library reindexed", type: "success" });
    });
  }, [runAction]);

  // Unlike the launch check, this one was asked for, so it reports either way,
  // including the way a development build cannot report on: it never ran.
  const checkForUpdates = useCallback(() => {
    runAction("could not check for updates", async () => {
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
          onValueChange={setQuery}
          placeholder={
            {
              actions: "run an action...",
              delete: "search notes, # for tags...",
              find: "search notes, # for tags...",
              move: "move to folder... (type a new name to create it)",
              rename: "new title...",
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
                  onCancel={backToActions}
                  onConfirm={confirmDelete}
                  title={currentNote.title}
                />
              ) : null}
              {view === "move" ? (
                <MoveView
                  folders={folders}
                  onCancel={backToActions}
                  onMove={moveToFolder}
                  onMoveToNewFolder={moveToNewFolder}
                  onMoveToRoot={moveToNotesRoot}
                  query={query}
                />
              ) : null}
              {view === "rename" ? (
                <RenameView
                  onCancel={backToActions}
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
                  onDone={backToActions}
                  onToggle={toggleTag}
                  title={currentNote.title}
                />
              ) : null}
            </>
          )}

          {view === "find" ? (
            <FindView
              allTags={allTags}
              notes={visibleNotes}
              onCreate={createFromQuery}
              onFilterTag={filterByTag}
              onSelectNote={openNote}
              query={query}
              searchError={searchError}
              tagQuery={tagQuery}
            />
          ) : null}

          {view === "actions" ? (
            <ActionsView
              actions={actions.filter(
                (action) =>
                  (!action.needsNote || currentNote !== undefined) &&
                  matchesQuery(action.label)
              )}
              chordsByName={chordsByName}
            />
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
