import { useDebouncedValue } from "@tanstack/react-pacer";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  Clock3Icon,
  FolderIcon,
  HashIcon,
  LayersIcon,
  PinIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { Highlighted } from "@/components/notes/note-label";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { NoteMeta } from "@/core/notes";
import { searchFolders } from "@/core/search";
import { indexStatusQuery } from "@/data/index-status";
import { noteQueries, notesDirQuery } from "@/data/queries";
import { readRecentNotes } from "@/lib/recent-notes";
import { openNote, useTabState } from "@/lib/tabs/store";
import { reasonOf } from "@/lib/ui/failure";
import { closeNoteBrowser, useNoteBrowser } from "@/lib/ui/note-browser";

type Collection =
  | { kind: "all" | "pinned" | "recent" }
  | { kind: "folder" | "tag"; value: string };

function collectionLabel(collection: Collection) {
  if (collection.kind === "folder") {
    return collection.value;
  }
  if (collection.kind === "tag") {
    return `#${collection.value}`;
  }
  return collection.kind === "all" ? "all notes" : collection.kind;
}

/**
 * The collection to show. A chosen folder deleted on disk leaves nothing to
 * show, so the browser shows every note and names the folder that went.
 */
function shownCollection(
  collection: Collection,
  folders: string[] | undefined
): { deleted?: string; shown: Collection } {
  return collection.kind === "folder" &&
    folders !== undefined &&
    !folders.includes(collection.value)
    ? { deleted: collection.value, shown: { kind: "all" } }
    : { shown: collection };
}

function collectionNotes(
  notes: NoteMeta[],
  collection: Collection,
  history: string[],
  query: string
) {
  const visited = new Set(history);
  const filtered = notes.filter((note) => {
    switch (collection.kind) {
      case "pinned": {
        return note.pinned;
      }
      case "recent": {
        return visited.has(note.path);
      }
      case "tag": {
        return note.tags.includes(collection.value);
      }
      case "folder": {
        return (
          note.folder === collection.value ||
          note.folder.startsWith(`${collection.value}/`)
        );
      }
      case "all": {
        return true;
      }
      default: {
        return false;
      }
    }
  });
  return collection.kind === "recent" && query.trim() === ""
    ? filtered.toSorted(
        (a, b) => history.indexOf(a.path) - history.indexOf(b.path)
      )
    : filtered;
}

function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    return;
  }
  const list = event.currentTarget.closest("[data-slot=sidebar-content]");
  if (list === null) {
    return;
  }
  const buttons = [...list.querySelectorAll("button")].filter(
    (button) => button.closest("details:not([open])") === null
  );
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

const shortDate = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

function editedDate(date: Date) {
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return "today";
  }
  const yesterday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1
  );
  return date.toDateString() === yesterday.toDateString()
    ? "yesterday"
    : shortDate.format(date);
}

function FolderCollection({
  folder,
  folders,
  collection,
  onChoose,
}: {
  folder: { count: number; folder: string };
  folders: { count: number; folder: string }[];
  collection: Collection;
  onChoose: (collection: Collection) => void;
}) {
  const children = folders.filter(
    (candidate) =>
      candidate.folder.includes("/") &&
      candidate.folder.slice(0, candidate.folder.lastIndexOf("/")) ===
        folder.folder
  );
  const selected =
    collection.kind === "folder" && collection.value === folder.folder;
  const row = (
    <SidebarMenuButton
      isActive={selected}
      aria-current={selected ? "true" : undefined}
      onClick={() => {
        onChoose({ kind: "folder", value: folder.folder });
      }}
      onKeyDown={moveFocus}
    >
      <FolderIcon className="text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {folder.folder.split("/").at(-1)}
      </span>
      {folder.count === 0 ? null : (
        <SidebarMenuBadge>{folder.count}</SidebarMenuBadge>
      )}
    </SidebarMenuButton>
  );
  return (
    <SidebarMenuItem>
      {children.length === 0 ? (
        row
      ) : (
        <>
          {row}
          <details open className="group/folder pl-4">
            <summary
              aria-label={`subfolders in ${folder.folder}`}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-6 cursor-pointer list-none items-center gap-1 rounded-sm px-2 text-xs outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
            >
              <ChevronRightIcon className="size-3 group-open/folder:rotate-90" />
              subfolders
            </summary>
            <SidebarMenu>
              {children.map((child) => (
                <FolderCollection
                  key={child.folder}
                  folder={child}
                  folders={folders}
                  collection={collection}
                  onChoose={onChoose}
                />
              ))}
            </SidebarMenu>
          </details>
        </>
      )}
    </SidebarMenuItem>
  );
}

function Collections({
  collection,
  history,
  known,
  library,
  onChoose,
}: {
  collection: Collection;
  history: string[];
  known: UseQueryResult<string[]>;
  library: UseQueryResult<NoteMeta[]>;
  onChoose: (collection: Collection) => void;
}) {
  // Counts come from the notes, so no folder row draws before both have loaded.
  const folders =
    known.data === undefined || library.data === undefined
      ? []
      : searchFolders(known.data, library.data);
  const failure = library.error ?? known.error;
  const tags = [
    ...new Set(library.data?.flatMap((note) => note.tags)),
  ].toSorted();
  const visited = new Set(history);
  const shortcuts = [
    { Icon: LayersIcon, count: library.data?.length, kind: "all" },
    {
      Icon: Clock3Icon,
      count: library.data?.filter((note) => visited.has(note.path)).length,
      kind: "recent",
    },
    {
      Icon: PinIcon,
      count: library.data?.filter((note) => note.pinned).length,
      kind: "pinned",
    },
  ] satisfies {
    Icon: typeof LayersIcon;
    count: number | undefined;
    kind: "all" | "recent" | "pinned";
  }[];

  return (
    <ScrollArea className="min-h-0 flex-1">
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu aria-label="collections">
            {shortcuts.map(({ Icon, count, kind }) => (
              <SidebarMenuItem key={kind}>
                <SidebarMenuButton
                  isActive={collection.kind === kind}
                  aria-current={collection.kind === kind ? "true" : undefined}
                  onClick={() => {
                    onChoose({ kind });
                  }}
                  onKeyDown={moveFocus}
                >
                  <Icon className="text-muted-foreground" />
                  <span className="flex-1">
                    {kind === "all" ? "all notes" : kind}
                  </span>
                  <SidebarMenuBadge>{count}</SidebarMenuBadge>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {folders.length === 0 ? null : (
        <SidebarGroup>
          <SidebarGroupLabel>folders</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {folders.map((folder) =>
                folder.folder.includes("/") ? null : (
                  <FolderCollection
                    key={folder.folder}
                    folder={folder}
                    folders={folders}
                    collection={collection}
                    onChoose={onChoose}
                  />
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
      {tags.length === 0 ? null : (
        <SidebarGroup>
          <SidebarGroupLabel>tags</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {tags.map((tag) => (
                <SidebarMenuItem key={tag}>
                  <SidebarMenuButton
                    isActive={
                      collection.kind === "tag" && collection.value === tag
                    }
                    onClick={() => {
                      onChoose({ kind: "tag", value: tag });
                    }}
                    onKeyDown={moveFocus}
                  >
                    <HashIcon className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{tag}</span>
                    <SidebarMenuBadge>
                      {
                        library.data?.filter((note) => note.tags.includes(tag))
                          .length
                      }
                    </SidebarMenuBadge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
      {library.isPending || known.isPending ? (
        <p className="text-muted-foreground p-3 text-xs">
          loading collections...
        </p>
      ) : null}
      {failure === null ? null : (
        <div role="alert" className="p-3 text-xs">
          <p>{reasonOf(failure)}</p>
          <Button
            onClick={() => {
              void library.refetch();
              void known.refetch();
            }}
            size="sm"
            variant="ghost"
          >
            retry
          </Button>
        </div>
      )}
    </ScrollArea>
  );
}

function Browser({ notesDir }: { notesDir: string }) {
  const open = useSidebar();
  const { activeId, tabs } = useTabState();
  const activeTab = tabs.find((tab) => tab.id === activeId);
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query, { wait: 150 });
  const [collection, setCollection] = useState<Collection>({ kind: "all" });
  const [picking, setPicking] = useState(false);
  const [history, setHistory] = useState(() => readRecentNotes(notesDir));
  const input = useRef<HTMLInputElement>(null);
  const rows = useRef<HTMLUListElement>(null);
  const scopeButton = useRef<HTMLButtonElement>(null);
  const library = useQuery({ ...noteQueries.list(), enabled: open });
  const known = useQuery({ ...noteQueries.folders(), enabled: open });
  const result = useQuery({
    ...noteQueries.list({
      includePreview: true,
      query: debounced,
      sort: "updated",
    }),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const status = useQuery({ ...indexStatusQuery, enabled: open });
  const pending =
    query !== debounced || result.isLoading || result.isPlaceholderData;
  const { deleted, shown } = shownCollection(collection, known.data);
  const label = collectionLabel(shown);
  const notes = collectionNotes(result.data ?? [], shown, history, debounced);

  useLayoutEffect(() => {
    if (open) {
      (picking ? scopeButton : input).current?.focus();
    }
  }, [open, picking]);

  function choose(next: Collection) {
    setCollection(next);
    setHistory(readRecentNotes(notesDir));
    setPicking(false);
  }

  return (
    <Sidebar
      data-note-browser=""
      aria-label="browse notes"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (picking) {
            setPicking(false);
          } else {
            closeNoteBrowser();
          }
        }
      }}
    >
      <SidebarHeader>
        <div className="flex h-7 items-center justify-between px-1">
          <span className="text-sm font-medium">library</span>
          <Button
            aria-label="close note browser"
            onClick={closeNoteBrowser}
            size="icon-xs"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
        <div hidden={picking}>
          <InputGroup variant="sidebar">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={`search ${label}`}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && !pending) {
                  event.preventDefault();
                  rows.current?.querySelector("button")?.focus();
                }
              }}
              placeholder="search notes..."
              ref={input}
              value={query}
            />
            {query === "" ? null : (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="clear search"
                  size="icon-xs"
                  onClick={() => {
                    setQuery("");
                    input.current?.focus();
                  }}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-expanded={picking}
              aria-label={
                picking ? "back to notes" : `choose collection: ${label}`
              }
              isActive={!picking}
              onClick={() => {
                if (!picking) {
                  setHistory(readRecentNotes(notesDir));
                }
                setPicking(!picking);
              }}
              ref={scopeButton}
            >
              {picking ? <ArrowLeftIcon /> : <LayersIcon />}
              <span className="min-w-0 flex-1 truncate">
                {picking ? "back to notes" : label}
              </span>
              {picking ? null : <ChevronsUpDownIcon />}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent hidden={!picking}>
        <Collections
          collection={shown}
          history={history}
          known={known}
          library={library}
          onChoose={choose}
        />
      </SidebarContent>
      <SidebarContent hidden={picking}>
        <SidebarGroupLabel className="mx-2 justify-between">
          <span>{query.trim() === "" ? label : "search results"}</span>
          <output aria-label="note count">
            {result.data === undefined ? null : notes.length}
          </output>
        </SidebarGroupLabel>
        {deleted === undefined ? null : (
          <output className="text-muted-foreground mx-3 mb-1 block text-xs">
            {deleted} was deleted, showing all notes
          </output>
        )}
        {result.isError ? (
          <div role="alert" className="p-3 text-xs">
            <p>could not load notes</p>
            <p>{reasonOf(result.error)}</p>
            <Button
              onClick={() => {
                void result.refetch();
              }}
              size="sm"
              variant="ghost"
            >
              retry
            </Button>
          </div>
        ) : null}
        <ScrollArea className="min-h-0 flex-1">
          {pending &&
          result.data === undefined &&
          status.data?.state === "scanning" ? (
            <output className="text-muted-foreground block px-3 py-2 text-xs">
              indexing notes...
            </output>
          ) : null}
          <div className="px-2 pb-2">
            <SidebarMenu
              aria-busy={pending}
              aria-label={`notes in ${label}`}
              ref={rows}
            >
              {notes.map((note) => (
                <SidebarMenuItem key={note.path}>
                  <SidebarMenuButton
                    isActive={
                      activeTab?.kind === "note" && activeTab.path === note.path
                    }
                    aria-current={
                      activeTab?.kind === "note" && activeTab.path === note.path
                        ? "page"
                        : undefined
                    }
                    aria-disabled={pending}
                    onClick={(event) => {
                      if (pending) {
                        return;
                      }
                      event.currentTarget.focus();
                      openNote(note.path, event.metaKey || event.ctrlKey);
                    }}
                    onKeyDown={moveFocus}
                    size="note"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm leading-snug">
                        {note.pinned ? (
                          <PinIcon
                            aria-label="pinned"
                            className="text-primary"
                          />
                        ) : null}
                        <Highlighted className="truncate" text={note.title} />
                      </span>
                      {note.snippet === null ? null : (
                        <Highlighted
                          className="text-muted-foreground line-clamp-2 text-xs leading-relaxed"
                          text={note.snippet}
                        />
                      )}
                      <span className="text-muted-foreground mt-0.5 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{note.folder}</span>
                        <time
                          className="shrink-0"
                          dateTime={note.updatedAt.toISOString()}
                        >
                          {editedDate(note.updatedAt)}
                        </time>
                      </span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
          {result.data !== undefined &&
          !result.isError &&
          notes.length === 0 ? (
            <Empty aria-live="polite">
              <EmptyHeader>
                <EmptyTitle>nothing found</EmptyTitle>
                <EmptyDescription>
                  Try different words or choose another collection.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  );
}

export function NoteBrowser() {
  const open = useNoteBrowser();
  const { data: notesDir } = useQuery({ ...notesDirQuery, enabled: open });
  return notesDir === undefined ? null : (
    <Browser key={notesDir} notesDir={notesDir} />
  );
}
