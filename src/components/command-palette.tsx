import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ClipboardIcon,
  CodeIcon,
  DownloadIcon,
  FilePlusIcon,
  FocusIcon,
  FolderIcon,
  FolderInputIcon,
  FolderSearchIcon,
  HashIcon,
  Link2Icon,
  ListXIcon,
  type LucideIcon,
  NotebookPenIcon,
  PanelRightCloseIcon,
  PencilIcon,
  PinIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  TagPlusIcon,
  Trash2Icon,
  Undo2Icon,
  WaypointsIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Chord } from "@/components/chord";
import { useNoteTags } from "@/components/notes/use-note-tags";
import { PaletteSearch } from "@/components/palette-search";
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
import { reindexAll } from "@/data/reindex";
import { retitleNote } from "@/data/retitle-note";
import { toggleFocusMode, useFocusMode } from "@/lib/prefs";
import { copyTabPath } from "@/lib/tabs/copy-path";
import {
  closeNoteTab,
  closeOtherTabs,
  closeTab,
  closeTabsAfter,
  getTabHandles,
  openNote as openInTab,
  renameTab,
  reopenTab,
  useTabSnapshot,
  useTabState,
} from "@/lib/tabs/store";
import { tabFullPath, tabId } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import { openNoteFind } from "@/lib/ui/find";
import { toggleGraph, useGraphMode } from "@/lib/ui/graph";
import { setMentionsOpen } from "@/lib/ui/mentions";
import { useChordsByName } from "@/lib/ui/shortcuts";
import { findUpdate, offerUpdate, updatesSupported } from "@/lib/updater";

const COUNT_CLASS =
  "w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums";

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

function toggleActionText(enabled: boolean, mode: string) {
  return `${enabled ? "turn off" : "turn on"} ${mode}`;
}

/** Which door opened the palette: ⌘P finds a note, ⌘⇧P runs an action. */
export type PaletteMode = "actions" | "find";

type PaletteView = "actions" | "delete" | "find" | "move" | "rename" | "tags";

/**
 * What an action needs on screen before it is offered. A note action reads
 * frontmatter, so an external file cannot answer it; a tab action acts on the
 * open set, which an external file answers as well as a note does.
 */
type PaletteScope = "editor" | "none" | "note" | "tab";

interface PaletteAction {
  Icon: LucideIcon;
  label: string;
  needs: PaletteScope;
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
  // A snapshot changes on every keystroke and this component is mounted for
  // the life of the window, so it subscribes only while it is on screen.
  const activeSnapshot = useTabSnapshot(open ? activeId : "");
  const graphEnabled = useGraphMode(activeId);
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

  const focusModeEnabled = useFocusMode();

  const toggleFocus = useCallback(() => {
    close();
    toggleFocusMode();
  }, [close]);

  const closeOthers = useCallback(() => {
    close();
    closeOtherTabs(activeId);
  }, [activeId, close]);

  const closeAfter = useCallback(() => {
    close();
    closeTabsAfter(activeId);
  }, [activeId, close]);

  const copyPath = useCallback(() => {
    close();

    if (activeTab !== undefined) {
      copyTabPath(tabFullPath(activeTab, notesDir));
    }
  }, [activeTab, close, notesDir]);

  const closeActive = useCallback(() => {
    close();
    closeTab(activeId);
  }, [activeId, close]);

  const reopenClosed = useCallback(() => {
    close();
    reopenTab();
  }, [close]);

  const toggleSource = useCallback(() => {
    close();
    getTabHandles(activeId)?.toggleSource();
  }, [activeId, close]);

  const findInNote = useCallback(() => {
    close();
    openNoteFind();
  }, [close]);

  const showMentions = useCallback(() => {
    close();
    setMentionsOpen(true);
  }, [close]);

  const toggleGraphView = useCallback(() => {
    close();
    toggleGraph(activeId);
  }, [activeId, close]);

  const quickCapture = useCallback(() => {
    runAction("could not open quick capture", () => invoke("show_capture"));
  }, [runAction]);

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

  const actions: PaletteAction[] = [
    {
      Icon: SearchIcon,
      label: "find in note",
      needs: "editor",
      onSelect: findInNote,
      text: "find in note",
      value: "find-in-note",
    },
    {
      Icon: FilePlusIcon,
      label: "new note",
      needs: "none",
      onSelect: newNote,
      text: "new note",
      value: "new-note",
    },
    {
      Icon: PinIcon,
      label: "pin",
      needs: "note",
      onSelect: togglePin,
      text: currentNote?.pinned ? "unpin note" : "pin note",
      value: "toggle-pin",
    },
    {
      Icon: TagPlusIcon,
      label: "edit tags",
      needs: "note",
      onSelect: startEditTags,
      text: "edit tags...",
      value: "edit-tags",
    },
    {
      Icon: Link2Icon,
      label: "show mentions",
      needs: "note",
      onSelect: showMentions,
      text: "show mentions",
      value: "show-mentions",
    },
    {
      Icon: PencilIcon,
      label: "rename note",
      needs: "note",
      onSelect: startRename,
      text: "rename note...",
      value: "rename-note",
    },
    {
      Icon: FolderInputIcon,
      label: "move to folder",
      needs: "note",
      onSelect: startMove,
      text: "move to folder...",
      value: "move-note",
    },
    {
      Icon: Trash2Icon,
      label: "delete note",
      needs: "note",
      onSelect: startDelete,
      text: "delete note...",
      value: "delete-note",
    },
    {
      Icon: FolderSearchIcon,
      label: "reveal in finder",
      needs: "note",
      onSelect: revealInFinder,
      text: "reveal in finder",
      value: "reveal-in-finder",
    },
    {
      Icon: FocusIcon,
      label: "focus mode",
      needs: "none",
      onSelect: toggleFocus,
      text: toggleActionText(focusModeEnabled, "focus mode"),
      value: "toggle-focus-mode",
    },
    {
      Icon: CodeIcon,
      label: "markdown source",
      needs: "tab",
      onSelect: toggleSource,
      text: toggleActionText(
        activeSnapshot?.sourceMode ?? false,
        "markdown source"
      ),
      value: "toggle-source",
    },
    {
      Icon: WaypointsIcon,
      label: "graph view",
      needs: "note",
      onSelect: toggleGraphView,
      text: toggleActionText(graphEnabled, "graph view"),
      value: "toggle-graph",
    },
    {
      Icon: XIcon,
      label: "close tab",
      needs: "tab",
      onSelect: closeActive,
      text: "close tab",
      value: "close-tab",
    },
    {
      Icon: ListXIcon,
      label: "close other tabs",
      needs: "tab",
      onSelect: closeOthers,
      text: "close other tabs",
      value: "close-other-tabs",
    },
    {
      Icon: PanelRightCloseIcon,
      label: "close tabs to the right",
      needs: "tab",
      onSelect: closeAfter,
      text: "close tabs to the right",
      value: "close-tabs-after",
    },
    {
      Icon: ClipboardIcon,
      label: "copy path",
      needs: "tab",
      onSelect: copyPath,
      text: "copy path",
      value: "copy-path",
    },
    {
      Icon: Undo2Icon,
      label: "reopen last closed tab",
      needs: "none",
      onSelect: reopenClosed,
      text: "reopen last closed tab",
      value: "reopen-tab",
    },
    {
      Icon: NotebookPenIcon,
      label: "quick capture",
      needs: "none",
      onSelect: quickCapture,
      text: "quick capture",
      value: "quick-capture",
    },
    {
      Icon: SettingsIcon,
      label: "settings",
      needs: "none",
      onSelect: openSettings,
      text: "settings",
      value: "settings",
    },
    {
      Icon: RefreshCwIcon,
      label: "reindex library",
      needs: "none",
      onSelect: reindex,
      text: "reindex library",
      value: "reindex",
    },
    {
      Icon: DownloadIcon,
      label: "check for updates",
      needs: "none",
      onSelect: checkForUpdates,
      text: "check for updates...",
      value: "check-for-updates",
    },
  ];

  const reachable = {
    editor: getTabHandles(activeId) !== undefined,
    none: true,
    note: currentNote !== undefined,
    tab: activeTab !== undefined,
  } satisfies Record<PaletteScope, boolean>;

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
            <PaletteSearch
              allTags={allTags}
              notes={notes}
              onCreate={createFromQuery}
              onQueryChange={setQuery}
              onSelectNote={openNote}
              query={query}
            />
          ) : null}

          {view === "actions" ? (
            <ActionsView
              actions={actions.filter(
                (action) =>
                  reachable[action.needs] && matchesQuery(action.label)
              )}
              chordsByName={chordsByName}
            />
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
