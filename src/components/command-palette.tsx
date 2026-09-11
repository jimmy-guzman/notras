import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { cn } from "cn";
import {
  ClipboardIcon,
  CodeIcon,
  DownloadIcon,
  FilePlusIcon,
  FocusIcon,
  FolderInputIcon,
  FolderSearchIcon,
  Link2Icon,
  ListXIcon,
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
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  ActionsView,
  type PaletteAction,
  type PaletteScope,
} from "@/components/palette-actions";
import { PaletteFilters } from "@/components/palette-filters";
import {
  DeleteView,
  MoveView,
  RenameView,
  TagsView,
} from "@/components/palette-note-views";
import { PaletteSearch } from "@/components/palette-search";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { createNote } from "@/data/create-note";
import { deleteNote } from "@/data/delete-note";
import { reindexAll } from "@/data/reindex";
import { toggleFocusMode, useFocusMode } from "@/lib/prefs";
import { copyTabPath } from "@/lib/tabs/copy-path";
import {
  changeNoteMetadata,
  closeNoteTab,
  closeOtherTabs,
  closeTab,
  closeTabsAfter,
  getTabHandles,
  openNote as openInTab,
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
import { commands } from "@/server/adapters/bindings";

function toggleActionText(enabled: boolean, mode: string) {
  return `${enabled ? "turn off" : "turn on"} ${mode}`;
}

/** Which door opened the palette: ⌘P finds a note, ⌘⇧P runs an action. */
export type PaletteMode = "actions" | "find";

type PaletteView =
  | "actions"
  | "delete"
  | "filters"
  | "find"
  | "move"
  | "rename"
  | "tags";

function PaletteFooter({
  label,
  loading,
  onSelect,
}: {
  label: string;
  loading: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-t px-3 py-2">
      <Button onClick={onSelect} size="sm" variant="ghost">
        {label}
      </Button>
      <span className="flex size-4 items-center justify-center">
        {loading ? <Spinner aria-label="searching notes" /> : null}
      </span>
    </div>
  );
}

interface CommandPaletteProps {
  mode: PaletteMode;
  notesDir: string;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  open: boolean;
  tag?: string;
}

export function CommandPalette({
  mode,
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
  const currentNote =
    currentPath === undefined || activeSnapshot === undefined
      ? undefined
      : {
          path: currentPath,
          pinned: activeSnapshot.pinned,
          tags: activeSnapshot.tags,
          title: activeSnapshot.title,
        };
  // cmdk's `onSelect` carries no event, so the modifier is read off the
  // gesture that triggered it, in the capture phase to beat cmdk's own handler.
  const newTabRef = useRef(false);

  // A tag chip navigates with `?tag=`, which is what opens the palette. The
  // parent keys this component on the tag and the mode, so the seed applies
  // once per tag and typing afterwards is never overwritten. Only find reads
  // a tag: switching to actions over an open filter starts on an empty input.
  const [query, setQuery] = useState(
    mode === "find" && tag !== undefined ? `#${tag} ` : ""
  );
  const [view, setView] = useState<PaletteView>(mode);
  const [filterQuery, setFilterQuery] = useState("");
  const [cursor, setCursor] = useState(query.length);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const resetSearchScroll = useCallback(() => {
    if (listRef.current !== null) {
      listRef.current.scrollTop = 0;
    }
  }, []);
  useLayoutEffect(() => {
    inputRef.current?.focus();
    if (view === "rename") {
      inputRef.current?.select();
    }
  }, [view]);
  const trackCursor = useCallback(
    (event: React.SyntheticEvent<HTMLInputElement>) => {
      setCursor(
        event.currentTarget.selectionStart ?? event.currentTarget.value.length
      );
    },
    []
  );
  const changeQuery = useCallback((next: string) => {
    setQuery(next);
    setCursor(inputRef.current?.selectionStart ?? next.length);
  }, []);
  const applySuggestion = useCallback((next: string) => {
    setQuery(next);
    setCursor(next.length);
    inputRef.current?.focus();
  }, []);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const backToActions = useCallback(() => {
    setQuery("");
    setView("actions");
  }, []);

  const back = useCallback(() => {
    if (view === "filters") {
      setFilterQuery("");
      setView("find");
    } else {
      backToActions();
    }
  }, [backToActions, view]);

  const showFilters = useCallback(() => {
    setFilterQuery("");
    setView("filters");
  }, []);

  const chooseFilter = useCallback((prefix: string) => {
    setQuery(
      (previous) =>
        `${previous.trimEnd()}${previous.trim() === "" ? "" : " "}${prefix}`
    );
    setView("find");
  }, []);

  const trackNewTab = useCallback(
    (event: React.KeyboardEvent | React.MouseEvent) => {
      newTabRef.current = event.metaKey || event.ctrlKey;
    },
    []
  );

  const handleOpenChange = useCallback<
    NonNullable<React.ComponentProps<typeof CommandDialog>["onOpenChange"]>
  >(
    (next, details) => {
      if (
        !next &&
        details.reason === "escape-key" &&
        view !== "actions" &&
        view !== "find"
      ) {
        details.cancel();
        back();
        return;
      }
      onOpenChange(next);
    },
    [back, onOpenChange, view]
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
        const session = getTabHandles(activeId);
        if (session?.changePath === undefined) {
          throw new Error("the note is still opening");
        }
        await session.changePath({ folder, kind: "move" });
      });
    },
    [activeId, currentNote, runAction]
  );

  const moveToNewFolder = useCallback(() => {
    moveToFolder(query.trim());
  }, [moveToFolder, query]);

  const confirmRename = useCallback(() => {
    if (currentNote === undefined) {
      return;
    }

    runAction("could not rename note", async () => {
      const session = getTabHandles(activeId);
      if (session?.changePath === undefined) {
        throw new Error("the note is still opening");
      }
      await session.changePath({ kind: "retitle", title: query.trim() });
    });
  }, [activeId, currentNote, query, runAction]);

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
      const path = await createNote({ title });

      openInTab(path, true);
    });
  }, [query, runAction]);

  const togglePin = useCallback(() => {
    if (currentNote === undefined) {
      return;
    }

    runAction("could not update pin", () =>
      changeNoteMetadata(currentNote.path, { pinned: !currentNote.pinned })
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
    setQuery("");
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
    runAction("could not open quick capture", commands.showCapture);
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

  const filterMode = view === "filters";
  const hasFooter = view === "find" || filterMode;
  const listView = view !== "rename" && view !== "delete";
  const inputValue = filterMode ? filterQuery : query;
  const changeInput = filterMode ? setFilterQuery : changeQuery;
  const footerAction = filterMode ? back : showFilters;
  const footerLabel = filterMode ? "back to notes" : "add filter";

  const reachable = {
    editor: getTabHandles(activeId) !== undefined,
    none: true,
    note: currentNote !== undefined,
    tab: activeTab !== undefined,
  } satisfies Record<PaletteScope, boolean>;

  const noteView = (() =>
    currentNote === undefined ? null : (
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
            onCancel={backToActions}
            onMove={moveToFolder}
            onMoveToNewFolder={moveToNewFolder}
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
            attached={currentNote.tags}
            onDone={backToActions}
            onQueryChange={setQuery}
            path={currentNote.path}
            query={query}
            title={currentNote.title}
          />
        ) : null}
      </>
    ))();

  return (
    <CommandDialog
      className={cn(
        "top-[min(20dvh,8rem)] flex max-h-[calc(80dvh-1rem)] flex-col gap-0",
        { "h-96": listView }
      )}
      description="search notes and run actions"
      onOpenChange={handleOpenChange}
      open={open}
      title="command palette"
    >
      <Command
        className={cn(
          "h-auto min-h-0 **:data-[slot=command-input-wrapper]:shrink-0",
          { "flex-1": listView }
        )}
        key={view}
        label={
          {
            actions: "run an action",
            delete: "confirm deletion",
            filters: "add a search filter",
            find: "find a note",
            move: "move to folder",
            rename: "rename note",
            tags: "edit tags",
          }[view]
        }
        onKeyDownCapture={trackNewTab}
        onMouseDownCapture={trackNewTab}
        shouldFilter={false}
      >
        <CommandInput
          data-slot="input-group-control"
          onSelect={trackCursor}
          onValueChange={changeInput}
          placeholder={
            {
              actions: "run an action...",
              delete: "confirm deletion",
              filters: "search filters...",
              find: "find a note...",
              move: "move to folder... (type a new name to create it)",
              rename: "new title...",
              tags: "find or create a tag...",
            }[view]
          }
          readOnly={view === "delete"}
          ref={inputRef}
          value={inputValue}
        />
        <CommandList
          className={cn("min-h-0", { "max-h-none flex-1": listView })}
          ref={listRef}
        >
          {noteView}

          {view === "filters" ? (
            <PaletteFilters onSelect={chooseFilter} query={filterQuery} />
          ) : null}

          {view === "find" ? (
            <PaletteSearch
              cursor={cursor}
              onCreate={createFromQuery}
              onLoadingChange={setSearchLoading}
              onQueryChange={applySuggestion}
              onResultQueryChange={resetSearchScroll}
              onSelectNote={openNote}
              query={query}
            />
          ) : null}

          {view === "actions" ? (
            <ActionsView
              actions={actions.filter(
                (action) =>
                  reachable[action.needs] &&
                  (matchesQuery(action.text) || matchesQuery(action.label))
              )}
              chordsByName={chordsByName}
            />
          ) : null}
        </CommandList>
      </Command>
      {hasFooter ? (
        <PaletteFooter
          label={footerLabel}
          loading={searchLoading}
          onSelect={footerAction}
        />
      ) : null}
    </CommandDialog>
  );
}
