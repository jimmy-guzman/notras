import { useQuery } from "@tanstack/react-query";
import {
  ArchiveIcon,
  CalendarDaysIcon,
  ClockFadingIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  HashIcon,
  PinIcon,
} from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { Chord } from "@/components/chord";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { PanelToggle } from "@/components/workspace/note-panel";
import type { NoteMeta } from "@/core/notes";
import { searchFolders } from "@/core/search";
import { indexStatusQuery } from "@/data/index-status";
import { noteQueries, notesDirQuery } from "@/data/queries";
import { notesByDay } from "@/lib/note-history";
import type { HistoryDay } from "@/lib/note-history";
import { useTabState } from "@/lib/tabs/store";
import { reasonOf } from "@/lib/ui/failure";
import { openSearchResult } from "@/lib/ui/find";
import {
  closeNoteBrowser,
  showNoteBrowserMode,
  useNoteBrowser,
  useNoteBrowserArrival,
  useNoteBrowserMode,
} from "@/lib/ui/note-browser";

import { NOTE_BROWSER_BUTTONS } from "./note-browser-buttons";

/** Left from a row inside a branch, or from a folded branch, goes to the branch that holds it, as in Finder. */
function focusParentBranch(event: KeyboardEvent<HTMLButtonElement>) {
  const branch = event.currentTarget.closest("ul")?.closest("li");
  const parent = branch?.querySelector<HTMLButtonElement>(":scope > button");

  if (parent !== undefined && parent !== null) {
    event.preventDefault();
    parent.focus();
  }
}

function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
  // A modified arrow is a workspace chord, such as stepping between tabs.
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }

  if (event.key === "ArrowLeft") {
    focusParentBranch(event);

    return;
  }

  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    return;
  }

  const list = event.currentTarget.closest("[data-slot=sidebar-content]");

  if (list === null) {
    return;
  }

  const buttons = [...list.querySelectorAll("button")];
  const index = buttons.indexOf(event.currentTarget);

  const next = {
    ArrowDown: index + 1,
    ArrowUp: index - 1,
    End: buttons.length - 1,
    Home: 0,
  };

  const position = Object.entries(next).find(([key]) => key === event.key)?.[1];

  if (position === undefined) {
    return;
  }

  event.preventDefault();
  buttons[Math.max(0, Math.min(buttons.length - 1, position))]?.focus();
}

/** Focuses the row of the note that shows, or the first row, as a mode arrives. With no row to focus the content takes the focus itself, so Escape still closes the browser. */
function focusRow(content: HTMLDivElement | null) {
  (
    content?.querySelector<HTMLElement>("[aria-current=page]") ??
    content?.querySelector<HTMLElement>("[data-slot=sidebar-menu-button]") ??
    content
  )?.focus();
}

/** Keeps the focus on a row as rows come and go. A row that arrives while the content holds the focus takes it, and a focused row that leaves hands it back to the content, so Escape and the arrow keys still work. Focus anywhere else stays where it is. */
function keepRowFocus(button: HTMLButtonElement | null) {
  const content = button?.closest<HTMLDivElement>(
    "[data-slot=sidebar-content]"
  );

  if (
    content !== null &&
    content !== undefined &&
    document.activeElement === content
  ) {
    focusRow(content);
  }

  return () => {
    if (
      content === null ||
      content === undefined ||
      document.activeElement !== button
    ) {
      return;
    }

    // The row is still in the document while its ref detaches, so the hand-off waits for the removal.
    queueMicrotask(() => {
      if (content.isConnected && document.activeElement === document.body) {
        focusRow(content);
      }
    });
  };
}

function NoteRow({
  depth = 0,
  note,
  showPin = true,
}: {
  depth?: number;
  note: NoteMeta;
  /** Off where every row is pinned, so the mark would tell no row from the next. */
  showPin?: boolean;
}) {
  const { activeId, tabs } = useTabState();
  const activeTab = tabs.find((tab) => tab.id === activeId);
  const showing = activeTab?.kind === "note" && activeTab.path === note.path;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        ref={keepRowFocus}
        aria-current={showing ? "page" : undefined}
        depth={depth}
        isActive={showing}
        onClick={(event) => {
          event.currentTarget.focus();
          openSearchResult(note, event.metaKey || event.ctrlKey);
        }}
        onKeyDown={moveFocus}
      >
        <FileTextIcon className="text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{note.title}</span>
        {note.pinned && showPin ? (
          <PinIcon aria-label="pinned" className="text-muted-foreground" />
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** A row that folds open to show what it holds. */
function Branch({
  Icon,
  OpenIcon = Icon,
  children,
  count,
  depth = 0,
  label,
  onToggle,
  open,
}: {
  Icon: typeof FileTextIcon;
  /** The icon while the branch is open, for an icon that can show it. */
  OpenIcon?: typeof FileTextIcon;
  children: ReactNode;
  count: number;
  depth?: number;
  label: string;
  onToggle: () => void;
  open: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        ref={keepRowFocus}
        aria-expanded={open}
        depth={depth}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (
            event.key === (open ? "ArrowLeft" : "ArrowRight") &&
            !(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
          ) {
            event.preventDefault();
            onToggle();
          } else {
            moveFocus(event);
          }
        }}
      >
        {open ? (
          <OpenIcon className="text-muted-foreground" />
        ) : (
          <Icon className="text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count === 0 ? null : <SidebarMenuBadge>{count}</SidebarMenuBadge>}
      </SidebarMenuButton>
      {open ? <SidebarMenu>{children}</SidebarMenu> : null}
    </SidebarMenuItem>
  );
}

const DAY_ICONS: Record<HistoryDay, typeof FileTextIcon> = {
  older: ArchiveIcon,
  "previous 7 days": CalendarDaysIcon,
  today: ClockIcon,
  yesterday: ClockFadingIcon,
};

interface Fold {
  onToggle: (key: string) => void;
  opened: Set<string>;
}

interface FolderCount {
  count: number;
  folder: string;
}

/** The folders and notes of the tree, each grouped by the folder that holds it, `""` for the root. */
interface Tree {
  folders: Map<string, FolderCount[]>;
  notes: Map<string, NoteMeta[]>;
}

function FolderBranch({
  depth = 0,
  fold,
  folder,
  tree,
}: {
  depth?: number;
  fold: Fold;
  folder: FolderCount;
  tree: Tree;
}) {
  return (
    <Branch
      Icon={FolderIcon}
      OpenIcon={FolderOpenIcon}
      count={folder.count}
      depth={depth}
      label={folder.folder.slice(folder.folder.lastIndexOf("/") + 1)}
      onToggle={() => {
        fold.onToggle(`folder:${folder.folder}`);
      }}
      open={fold.opened.has(`folder:${folder.folder}`)}
    >
      {tree.folders.get(folder.folder)?.map((child) => (
        <FolderBranch
          depth={depth + 1}
          fold={fold}
          folder={child}
          key={child.folder}
          tree={tree}
        />
      ))}
      {tree.notes.get(folder.folder)?.map((note) => (
        <NoteRow depth={depth + 1} key={note.path} note={note} />
      ))}
    </Branch>
  );
}

function Nothing({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Empty aria-live="polite">
      <EmptyHeader>
        <EmptyMedia>
          <Mark expression="meh" size={32} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function HistoryRows({ fold, notes }: { fold: Fold; notes: NoteMeta[] }) {
  const days = notesByDay(notes, useNoteBrowserArrival());

  return days.size === 0 ? (
    <Nothing title="no notes yet">
      Write a note with <Chord hotkey="Mod+N" /> and it shows here.
    </Nothing>
  ) : (
    <SidebarMenu aria-label="history">
      {[...days].map(([day, saved]) => (
        <Branch
          Icon={DAY_ICONS[day]}
          count={saved.length}
          key={day}
          label={day}
          onToggle={() => {
            fold.onToggle(`day:${day}`);
          }}
          open={fold.opened.has(`day:${day}`)}
        >
          {saved.map((note) => (
            <NoteRow depth={1} key={note.path} note={note} />
          ))}
        </Branch>
      ))}
    </SidebarMenu>
  );
}

/** The ancestors of a folder and the folder itself, so a branch deep in the tree shows. */
function folderChain(folder: string) {
  return folder === ""
    ? []
    : folder
        .split("/")
        .map((_, index, parts) => parts.slice(0, index + 1).join("/"));
}

function Browser() {
  const open = useSidebar();
  const mode = useNoteBrowserMode();
  const { activeId, tabs } = useTabState();
  const library = useQuery({ ...noteQueries.list(), enabled: open });
  const known = useQuery({ ...noteQueries.folders(), enabled: open });
  const status = useQuery({ ...indexStatusQuery, enabled: open });

  const showing = tabs.find((tab) => tab.id === activeId);

  // Opened as a mode arrives, so the tree opens on the note that shows.
  const showingFolders =
    showing?.kind === "note"
      ? folderChain(
          showing.path.slice(0, Math.max(0, showing.path.lastIndexOf("/")))
        ).map((folder) => `folder:${folder}`)
      : [];

  const [opened, setOpened] = useState(
    () => new Set([...showingFolders, "day:today", "day:yesterday"])
  );

  const arrival = `${mode}:${open}`;
  const [arrived, setArrived] = useState(arrival);

  if (arrived !== arrival) {
    setArrived(arrival);
    setOpened((keys) => new Set([...keys, ...showingFolders]));
  }

  const notes = library.data;

  // Only the folder tree reads the folder list, so the other modes neither wait on it nor fail with it.
  const folderNames = mode === "folders" ? known.data : [];
  const reads = mode === "folders" ? [library, known] : [library];
  const failure = reads.find((read) => read.isLoadingError);

  const fold: Fold = {
    onToggle: (key) => {
      setOpened((keys) => {
        const next = new Set(keys);

        if (!next.delete(key)) {
          next.add(key);
        }

        return next;
      });
    },
    opened,
  };

  function rowsFor(unsorted: NoteMeta[], knownFolders: string[]) {
    const listed = unsorted.toSorted(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || a.title.localeCompare(b.title)
    );

    if (mode === "folders") {
      const folders = searchFolders(knownFolders, listed);

      const tree: Tree = {
        folders: Map.groupBy(folders, ({ folder }) =>
          folder.slice(0, Math.max(0, folder.lastIndexOf("/")))
        ),
        notes: Map.groupBy(listed, (note) => note.folder),
      };

      return listed.length === 0 && folders.length === 0 ? (
        <Nothing title="no notes yet">
          Write a note with <Chord hotkey="Mod+N" /> and it shows here.
        </Nothing>
      ) : (
        <SidebarMenu aria-label="folders">
          {tree.folders.get("")?.map((folder) => (
            <FolderBranch
              fold={fold}
              folder={folder}
              key={folder.folder}
              tree={tree}
            />
          ))}
          {tree.notes.get("")?.map((note) => (
            <NoteRow key={note.path} note={note} />
          ))}
        </SidebarMenu>
      );
    }

    if (mode === "tags") {
      const byTag = Map.groupBy(
        listed.flatMap((note) =>
          [...new Set(note.tags)].map((tag) => ({ note, tag }))
        ),
        ({ tag }) => tag
      );

      const tags = [...byTag].toSorted(([left], [right]) =>
        left < right ? -1 : 1
      );

      return tags.length === 0 ? (
        <Nothing title="no tags yet">
          Tag a note with <Chord hotkey="Mod+Shift+Y" /> and it shows here.
        </Nothing>
      ) : (
        <SidebarMenu aria-label="tags">
          {tags.map(([tag, tagged]) => (
            <Branch
              Icon={HashIcon}
              count={tagged.length}
              key={tag}
              label={tag}
              onToggle={() => {
                fold.onToggle(`tag:${tag}`);
              }}
              open={opened.has(`tag:${tag}`)}
            >
              {tagged.map(({ note }) => (
                <NoteRow depth={1} key={note.path} note={note} />
              ))}
            </Branch>
          ))}
        </SidebarMenu>
      );
    }

    if (mode === "history") {
      return <HistoryRows fold={fold} notes={listed} />;
    }

    const pinned = listed.filter((note) => note.pinned);

    return pinned.length === 0 ? (
      <Nothing title="nothing pinned">
        Pin a note with <Chord hotkey="Mod+Shift+D" /> and it shows here.
      </Nothing>
    ) : (
      <SidebarMenu aria-label="pinned notes">
        {pinned.map((note) => (
          <NoteRow key={note.path} note={note} showPin={false} />
        ))}
      </SidebarMenu>
    );
  }

  return (
    <Sidebar
      data-note-browser=""
      aria-label="browse notes"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeNoteBrowser();
        }
      }}
    >
      {open ? (
        <SidebarContent
          // A new key remounts the content, which takes the focus as a mode arrives.
          key={mode}
          ref={focusRow}
          tabIndex={-1}
        >
          {failure === undefined ? null : (
            <div role="alert" className="p-3 text-xs">
              <p>could not load notes</p>
              <p>{reasonOf(failure.error)}</p>
              <Button
                onClick={(event) => {
                  // The retry button leaves with the alert, so a keyboard retry hands the focus to the content for the rows to take.
                  if (document.activeElement === event.currentTarget) {
                    event.currentTarget
                      .closest<HTMLElement>("[data-slot=sidebar-content]")
                      ?.focus();
                  }

                  for (const read of reads) {
                    void read.refetch();
                  }
                }}
                size="sm"
                variant="ghost"
              >
                retry
              </Button>
            </div>
          )}
          {(notes === undefined || folderNames === undefined) &&
          failure === undefined ? (
            <output className="text-muted-foreground block px-3 py-2 text-xs">
              {status.data?.state === "scanning"
                ? "indexing notes…"
                : "loading notes…"}
            </output>
          ) : null}
          {notes === undefined || folderNames === undefined ? null : (
            <ScrollArea className="min-h-0 flex-1">
              <div className="py-1">{rowsFor(notes, folderNames)}</div>
            </ScrollArea>
          )}
        </SidebarContent>
      ) : null}
    </Sidebar>
  );
}

/** The browser's modes as buttons, one lit, for the band above the browser. */
export function NoteBrowserModes() {
  const mode = useNoteBrowserMode();

  return (
    <ToggleGroup
      aria-label="browse by"
      onValueChange={([picked]) => {
        // Base UI reports a click on the lit item as an empty value. The modes are a choice of one, so that click keeps the mode.
        if (picked !== undefined) {
          showNoteBrowserMode(picked);
        }
      }}
      spacing={0}
      value={[mode]}
      variant="mark-bottom"
    >
      {NOTE_BROWSER_BUTTONS.map(({ Icon, label, mode: value }) => (
        <PanelToggle Icon={Icon} key={value} label={label} value={value} />
      ))}
    </ToggleGroup>
  );
}

export function NoteBrowser() {
  const open = useNoteBrowser();
  const { data: notesDir } = useQuery({ ...notesDirQuery, enabled: open });

  return notesDir === undefined ? null : <Browser key={notesDir} />;
}
