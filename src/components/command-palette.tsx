import { useNavigate, useParams } from "@tanstack/react-router";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderInputIcon,
  FolderSearchIcon,
  HashIcon,
  PencilIcon,
  PinIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  TagPlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import type { NoteMeta } from "@/core";
import { filenameFromTitle } from "@/core";
import { createNote } from "@/data/create-note";
import { deleteNote } from "@/data/delete-note";
import { getNotes } from "@/data/get-notes";
import { moveNote } from "@/data/move-note";
import { setNotePinned } from "@/data/pin-note";
import { reindexAll } from "@/data/reindex";
import { retitleNote } from "@/data/retitle-note";
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
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const currentPath = params._splat;
  const currentNote = notes.find((note) => note.path === currentPath);

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
      const filters =
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

  const openNote = useCallback(
    (path: string) => {
      close();
      navigate({ params: { _splat: path }, to: "/notes/$" });
    },
    [close, navigate]
  );

  const runAction = useCallback(
    (action: () => Promise<void>) => {
      close();
      action().catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "something went wrong"
        );
      });
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

  // Hooks cannot sit under the `currentNote !== undefined` guard the JSX uses,
  // so the handlers that need a note re-state it.
  const confirmDelete = useCallback(() => {
    if (currentNote === undefined) {
      return;
    }

    runAction(async () => {
      await deleteNote(currentNote.path);
      await navigate({ to: "/" });
      toast.success("note deleted");
    });
  }, [currentNote, navigate, runAction]);

  const moveToFolder = useCallback(
    (folder: string) => {
      if (currentNote === undefined) {
        return;
      }

      runAction(async () => {
        const next = await moveNote(currentNote.path, folder);

        openNote(next);
      });
    },
    [currentNote, openNote, runAction]
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

      openNote(next);
    });
  }, [currentNote, openNote, query, runAction]);

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

      openNote(path);
    });
  }, [openNote, runAction]);

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

  const reindex = useCallback(() => {
    runAction(async () => {
      await reindexAll();
      toast.success("library reindexed");
    });
  }, [runAction]);

  return (
    <CommandDialog
      description="search notes and run actions"
      onOpenChange={handleOpenChange}
      open={open}
      title="command palette"
    >
      <Command shouldFilter={false}>
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
          {view === "delete" && currentNote !== undefined ? (
            <CommandGroup heading={`delete "${currentNote.title}"?`}>
              <CommandItem onSelect={confirmDelete} value="confirm-delete">
                <Trash2Icon className="text-destructive" />
                delete forever
              </CommandItem>
              <CommandItem onSelect={backToRoot} value="cancel-delete">
                cancel
              </CommandItem>
            </CommandGroup>
          ) : null}

          {view === "move" && currentNote !== undefined ? (
            <CommandGroup heading="move to">
              <CommandItem onSelect={moveToNotesRoot} value="move-root">
                <FolderIcon />
                notes root
              </CommandItem>
              {folders
                .filter(({ folder }) =>
                  folder.includes(query.trim().toLowerCase())
                )
                .map(({ count, folder }) => (
                  <FolderItem
                    count={count}
                    folder={folder}
                    key={folder}
                    onMove={moveToFolder}
                  />
                ))}
              {query.trim() === "" ? null : (
                <CommandItem onSelect={moveToNewFolder} value="move-new">
                  <FolderInputIcon />
                  new folder "{query.trim().toLowerCase()}"
                </CommandItem>
              )}
              <CommandItem onSelect={backToRoot} value="cancel-move">
                cancel
              </CommandItem>
            </CommandGroup>
          ) : null}

          {view === "rename" && currentNote !== undefined ? (
            <CommandGroup heading={`rename "${currentNote.title}"`}>
              {query.trim() === "" ? null : (
                <CommandItem onSelect={confirmRename} value="confirm-rename">
                  <PencilIcon />
                  <span className="truncate">
                    rename to "{query.trim()}"
                    {/* The filename is derived, so it is shown, not hidden. */}
                    <span className="text-muted-foreground">
                      {" · "}
                      {filenameFromTitle(query.trim())}.md
                    </span>
                  </span>
                </CommandItem>
              )}
              <CommandItem onSelect={backToRoot} value="cancel-rename">
                cancel
              </CommandItem>
            </CommandGroup>
          ) : null}

          {view === "tags" && currentNote !== undefined ? (
            <CommandGroup heading={`tags for "${currentNote.title}"`}>
              {tagChoices.map((name) => (
                <TagChoiceItem
                  attached={noteTags.tags.includes(name)}
                  count={tagCounts.get(name) ?? 0}
                  key={name}
                  name={name}
                  onToggle={toggleTag}
                />
              ))}
              {draftTag === "" || tagChoices.includes(draftTag) ? null : (
                <CommandItem onSelect={createTag} value="tag-new">
                  <TagPlusIcon />
                  create "{draftTag}"
                </CommandItem>
              )}
              <CommandItem onSelect={backToRoot} value="cancel-tags">
                done
              </CommandItem>
            </CommandGroup>
          ) : null}

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
                {matchesQuery("new note") ? (
                  <CommandItem onSelect={newNote} value="new-note">
                    <FilePlusIcon />
                    new note
                  </CommandItem>
                ) : null}
                {currentNote !== undefined && matchesQuery("pin") ? (
                  <CommandItem onSelect={togglePin} value="toggle-pin">
                    <PinIcon />
                    {currentNote.pinned ? "unpin note" : "pin note"}
                  </CommandItem>
                ) : null}
                {currentNote !== undefined && matchesQuery("edit tags") ? (
                  <CommandItem onSelect={startEditTags} value="edit-tags">
                    <TagPlusIcon />
                    edit tags...
                  </CommandItem>
                ) : null}
                {currentNote !== undefined && matchesQuery("rename note") ? (
                  <CommandItem onSelect={startRename} value="rename-note">
                    <PencilIcon />
                    rename note...
                  </CommandItem>
                ) : null}
                {currentNote !== undefined && matchesQuery("move to folder") ? (
                  <CommandItem onSelect={startMove} value="move-note">
                    <FolderInputIcon />
                    move to folder...
                  </CommandItem>
                ) : null}
                {currentNote !== undefined && matchesQuery("delete note") ? (
                  <CommandItem onSelect={startDelete} value="delete-note">
                    <Trash2Icon />
                    delete note...
                  </CommandItem>
                ) : null}
                {currentNote !== undefined &&
                matchesQuery("reveal in finder") ? (
                  <CommandItem
                    onSelect={revealInFinder}
                    value="reveal-in-finder"
                  >
                    <FolderSearchIcon />
                    reveal in finder
                  </CommandItem>
                ) : null}
                {matchesQuery("settings") ? (
                  <CommandItem onSelect={openSettings} value="settings">
                    <SettingsIcon />
                    settings
                  </CommandItem>
                ) : null}
                {matchesQuery("reindex library") ? (
                  <CommandItem onSelect={reindex} value="reindex">
                    <RefreshCwIcon />
                    reindex library
                  </CommandItem>
                ) : null}
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
