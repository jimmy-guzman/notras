import { detectPlatform } from "@tanstack/react-hotkeys";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { cn } from "cn";
import {
  Code2Icon,
  CopyIcon,
  DownloadIcon,
  FileOutputIcon,
  FocusIcon,
  FolderInputIcon,
  FolderOpenIcon,
  FolderOutputIcon,
  Link2Icon,
  ListEndIcon,
  ListXIcon,
  NotebookPenIcon,
  PanelLeftIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  TagIcon,
  Trash2Icon,
  Undo2Icon,
  WaypointsIcon,
  XIcon,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { ActionsView } from "@/components/palette-actions";
import type { PaletteAction, PaletteScope } from "@/components/palette-actions";
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
import { noteFolder } from "@/core/notes";
import { createNote } from "@/data/create-note";
import { deleteNote } from "@/data/delete-note";
import { reindexAll } from "@/data/reindex";
import { toggleFocusMode, useFocusMode } from "@/lib/prefs";
import { forgetNote } from "@/lib/recent-notes";
import { copyTabPath } from "@/lib/tabs/copy-path";
import {
  changeNoteMetadata,
  closeNoteTab,
  closeOtherTabs,
  closeTab,
  closeTabsAfter,
  getTabHandles,
  openDraft,
  openNote as openInTab,
  reopenTab,
  useTabSnapshot,
  useTabState,
} from "@/lib/tabs/store";
import { tabFullPath } from "@/lib/tabs/tab";
import { reasonOf } from "@/lib/ui/failure";
import { openNoteFind } from "@/lib/ui/find";
import { toggleGraph, useGraphMode } from "@/lib/ui/graph";
import { setMentionsOpen } from "@/lib/ui/mentions";
import { toggleNoteBrowser, useNoteBrowser } from "@/lib/ui/note-browser";
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

// oxlint-disable-next-line complexity, react-doctor/no-giant-component -- the split is tracked in #203
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
  const activeTab = tabs.find((tab) => tab.id === activeId);
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
  const resetSearchScroll = () => {
    if (listRef.current !== null) {
      listRef.current.scrollTop = 0;
    }
  };
  useLayoutEffect(() => {
    inputRef.current?.focus();
    if (view === "rename") {
      inputRef.current?.select();
    }
  }, [view]);
  const trackCursor = (event: React.SyntheticEvent<HTMLInputElement>) => {
    setCursor(
      event.currentTarget.selectionStart ?? event.currentTarget.value.length
    );
  };
  const changeQuery = (next: string) => {
    setQuery(next);
    setCursor(inputRef.current?.selectionStart ?? next.length);
  };
  const applySuggestion = (next: string) => {
    setQuery(next);
    setCursor(next.length);
    inputRef.current?.focus();
  };

  const close = () => {
    onOpenChange(false);
  };

  const backToActions = () => {
    setQuery("");
    setView("actions");
  };

  const back = () => {
    if (view === "filters") {
      setFilterQuery("");
      setView("find");
    } else {
      backToActions();
    }
  };

  const showFilters = () => {
    setFilterQuery("");
    setView("filters");
  };

  const chooseFilter = (prefix: string) => {
    setQuery(
      (previous) =>
        `${previous.trimEnd()}${previous.trim() === "" ? "" : " "}${prefix}`
    );
    setView("find");
  };

  const trackNewTab = (event: React.KeyboardEvent | React.MouseEvent) => {
    newTabRef.current = event.metaKey || event.ctrlKey;
  };

  const handleOpenChange: NonNullable<
    React.ComponentProps<typeof CommandDialog>["onOpenChange"]
  > = (next, details) => {
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
  };

  const openNote = (path: string) => {
    const newTab = newTabRef.current;

    newTabRef.current = false;
    close();
    openInTab(path, newTab);
  };

  const runAction = async (what: string, action: () => Promise<void>) => {
    close();

    try {
      await action();
    } catch (error) {
      toast.add({ description: reasonOf(error), title: what, type: "error" });
    }
  };

  const matchesQuery = (label: string) =>
    label.toLowerCase().includes(query.trim().toLowerCase());

  const confirmDelete = () => {
    if (currentNote === undefined) {
      return;
    }

    void runAction("could not delete note", async () => {
      await deleteNote(currentNote.path);
      forgetNote(notesDir, currentNote.path);
      closeNoteTab(currentNote.path);
      toast.add({ title: "note deleted", type: "success" });
    });
  };

  const moveToFolder = (folder: string) => {
    if (currentNote === undefined) {
      return;
    }

    void runAction("could not move note", async () => {
      const session = getTabHandles(activeId);
      if (session?.changePath === undefined) {
        throw new Error("The note is still opening");
      }
      await session.changePath({ folder, kind: "move" });
    });
  };

  const moveToNewFolder = () => {
    moveToFolder(query.trim());
  };

  const confirmRename = () => {
    if (currentNote === undefined) {
      return;
    }

    void runAction("could not rename note", async () => {
      const session = getTabHandles(activeId);
      if (session?.changePath === undefined) {
        throw new Error("The note is still opening");
      }
      await session.changePath({ kind: "retitle", title: query.trim() });
    });
  };

  // `create` de-duplicates by appending a counter, so a stale index or a
  // title that differs from its filename never overwrites the existing note.
  const createFromQuery = () => {
    const title = query.trim();

    void runAction("could not create note", async () => {
      const { path } = await createNote({ title });

      openInTab(path, true);
    });
  };

  const focusModeEnabled = useFocusMode();
  const noteBrowserOpen = useNoteBrowser();

  // pdf.rs prints through AppKit, so the row exists where AppKit does.
  const exportPdfAction: PaletteAction = {
    Icon: FileOutputIcon,
    label: "export pdf",
    needs: "editor",
    onSelect: () => {
      void runAction("could not export pdf", async () => {
        const path = await getTabHandles(activeId)?.exportPdf();
        if (path !== undefined && path !== null) {
          toast.add({ title: "pdf exported", type: "success" });
        }
      });
    },
    text: "export pdf...",
    value: "export-pdf",
  };

  const actions: PaletteAction[] = [
    {
      Icon: PanelLeftIcon,
      label: "browse notes",
      needs: "none",
      onSelect: () => {
        close();
        toggleNoteBrowser();
      },
      text: noteBrowserOpen ? "close note browser" : "browse notes",
      value: "browse-notes",
    },
    {
      Icon: SearchIcon,
      label: "find in note",
      needs: "editor",
      onSelect: () => {
        close();
        openNoteFind();
      },
      text: "find in note",
      value: "find-in-note",
    },
    {
      Icon: PlusIcon,
      label: "new note",
      needs: "none",
      onSelect: () => {
        close();
        openDraft();
      },
      text: "new note",
      value: "new-note",
    },
    {
      Icon: PinIcon,
      label: "pin",
      needs: "note",
      onSelect: () => {
        if (currentNote === undefined) {
          return;
        }

        void runAction("could not update pin", async () => {
          await changeNoteMetadata(currentNote.path, ({ pinned }) => ({
            pinned: !pinned,
          }));
        });
      },
      text: currentNote?.pinned === true ? "unpin note" : "pin note",
      value: "toggle-pin",
    },
    {
      Icon: TagIcon,
      label: "edit tags",
      needs: "note",
      onSelect: () => {
        setQuery("");
        setView("tags");
      },
      text: "edit tags...",
      value: "edit-tags",
    },
    {
      Icon: Link2Icon,
      label: "show mentions",
      needs: "note",
      onSelect: () => {
        close();
        setMentionsOpen(true);
      },
      text: "show mentions",
      value: "show-mentions",
    },
    {
      Icon: PencilIcon,
      label: "rename note",
      needs: "note",
      onSelect: () => {
        setQuery(currentNote?.title ?? "");
        setView("rename");
      },
      text: "rename note...",
      value: "rename-note",
    },
    {
      Icon: FolderInputIcon,
      label: "move to folder",
      needs: "note",
      onSelect: () => {
        setQuery("");
        setView("move");
      },
      text: "move to folder...",
      value: "move-note",
    },
    {
      Icon: FolderOutputIcon,
      label: "remove from folder",
      needs: "filed",
      onSelect: () => {
        moveToFolder("");
      },
      text: "remove from folder",
      value: "remove-from-folder",
    },
    {
      Icon: Trash2Icon,
      label: "delete note",
      needs: "note",
      onSelect: () => {
        setQuery("");
        setView("delete");
      },
      text: "delete note...",
      value: "delete-note",
    },
    {
      Icon: FolderOpenIcon,
      label: "reveal in finder",
      needs: "note",
      onSelect: () => {
        if (currentNote === undefined) {
          return;
        }

        void runAction("could not reveal note", async () => {
          await revealItemInDir(`${notesDir}/${currentNote.path}`);
        });
      },
      text: "reveal in finder",
      value: "reveal-in-finder",
    },
    {
      Icon: FocusIcon,
      label: "focus mode",
      needs: "none",
      onSelect: () => {
        close();
        toggleFocusMode();
      },
      text: toggleActionText(focusModeEnabled, "focus mode"),
      value: "toggle-focus-mode",
    },
    {
      Icon: Code2Icon,
      label: "markdown source",
      needs: "tab",
      onSelect: () => {
        close();
        getTabHandles(activeId)?.toggleSource();
      },
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
      onSelect: () => {
        close();
        toggleGraph(activeId);
      },
      text: toggleActionText(graphEnabled, "graph view"),
      value: "toggle-graph",
    },
    {
      Icon: XIcon,
      label: "close tab",
      needs: "tab",
      onSelect: () => {
        close();
        closeTab(activeId);
      },
      text: "close tab",
      value: "close-tab",
    },
    {
      Icon: ListXIcon,
      label: "close other tabs",
      needs: "tab",
      onSelect: () => {
        close();
        closeOtherTabs(activeId);
      },
      text: "close other tabs",
      value: "close-other-tabs",
    },
    {
      Icon: ListEndIcon,
      label: "close tabs to the right",
      needs: "tab",
      onSelect: () => {
        close();
        closeTabsAfter(activeId);
      },
      text: "close tabs to the right",
      value: "close-tabs-after",
    },
    ...(detectPlatform() === "mac" ? [exportPdfAction] : []),
    {
      Icon: CopyIcon,
      label: "copy path",
      needs: "file",
      onSelect: () => {
        close();

        if (activeTab !== undefined) {
          void copyTabPath(tabFullPath(activeTab, notesDir));
        }
      },
      text: "copy path",
      value: "copy-path",
    },
    {
      Icon: Undo2Icon,
      label: "reopen last closed tab",
      needs: "none",
      onSelect: () => {
        close();
        reopenTab();
      },
      text: "reopen last closed tab",
      value: "reopen-tab",
    },
    {
      Icon: NotebookPenIcon,
      label: "quick capture",
      needs: "none",
      onSelect: () => {
        void runAction("could not open quick capture", async () => {
          await commands.showCapture();
        });
      },
      text: "quick capture",
      value: "quick-capture",
    },
    {
      Icon: SettingsIcon,
      label: "settings",
      needs: "none",
      onSelect: () => {
        close();
        onOpenSettings();
      },
      text: "settings",
      value: "settings",
    },
    {
      Icon: RefreshCwIcon,
      label: "reindex library",
      needs: "none",
      onSelect: () => {
        void runAction("could not reindex library", async () => {
          await reindexAll();
          toast.add({ title: "library reindexed", type: "success" });
        });
      },
      text: "reindex library",
      value: "reindex",
    },
    {
      Icon: DownloadIcon,
      label: "check for updates",
      needs: "none",
      // An explicit check reports whether it ran, including in development.
      onSelect: () => {
        void runAction("could not check for updates", async () => {
          if (!updatesSupported()) {
            toast.add({
              title: "update checks are off in development",
              type: "info",
            });

            return;
          }

          const update = await findUpdate();

          if (update === null) {
            toast.add({ title: "notras is up to date", type: "success" });

            return;
          }

          offerUpdate(update);
        });
      },
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
    file: activeTab !== undefined && activeTab.kind !== "draft",
    filed: currentNote !== undefined && noteFolder(currentNote.path) !== "",
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
        "top-[min(20dvh,8rem)] flex max-h-[calc(80dvh-1rem)] flex-col",
        { "h-96": listView }
      )}
      description="Search notes and run actions"
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
              notesDir={notesDir}
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
              query={query}
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
