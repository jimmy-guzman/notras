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
import { useEffect, useRef, useState } from "react";
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
  return (
    <CommandItem
      key={note.path}
      onSelect={() => {
        onSelect(note.path);
      }}
      value={note.path}
    >
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

  const updateQuery = (value: string) => {
    latestSearchRef.current += 1;
    setQuery(value);
    void search(value, latestSearchRef.current);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery("");
      setView("root");
      setResults(null);
    }

    onOpenChange(next);
  };

  useEffect(() => {
    if (tag !== undefined) {
      latestSearchRef.current += 1;
      void search(`#${tag} `, latestSearchRef.current);
    }
  }, [search, tag]);

  const tagQuery = parseTagQuery(query);
  const visibleNotes = (() => {
    if (tagQuery !== undefined && !knownTags.has(tagQuery.tag)) {
      return [];
    }

    return results ?? notes.slice(0, 20);
  })();

  const close = () => {
    handleOpenChange(false);
  };

  const openNote = (path: string) => {
    close();
    void navigate({ params: { _splat: path }, to: "/notes/$" });
  };

  const runAction = (action: () => Promise<void>) => {
    close();
    void action().catch((error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "something went wrong"
      );
    });
  };

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
              <CommandItem
                onSelect={() => {
                  runAction(async () => {
                    await deleteNote(currentNote.path);
                    await navigate({ to: "/" });
                    toast.success("note deleted");
                  });
                }}
                value="confirm-delete"
              >
                <Trash2Icon className="text-destructive" />
                delete forever
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setView("root");
                }}
                value="cancel-delete"
              >
                cancel
              </CommandItem>
            </CommandGroup>
          ) : null}

          {view === "move" && currentNote !== undefined ? (
            <CommandGroup heading="move to">
              <CommandItem
                onSelect={() => {
                  runAction(async () => {
                    const next = await moveNote(currentNote.path, "");

                    openNote(next);
                  });
                }}
                value="move-root"
              >
                <FolderIcon />
                notes root
              </CommandItem>
              {folders
                .filter(({ folder }) =>
                  folder.includes(query.trim().toLowerCase())
                )
                .map(({ count, folder }) => (
                  <CommandItem
                    key={folder}
                    onSelect={() => {
                      runAction(async () => {
                        const next = await moveNote(currentNote.path, folder);

                        openNote(next);
                      });
                    }}
                    value={`move-${folder}`}
                  >
                    <FolderIcon />
                    <span className="flex-1 truncate">{folder}</span>
                    <span className={COUNT_CLASS}>{count}</span>
                  </CommandItem>
                ))}
              {query.trim() === "" ? null : (
                <CommandItem
                  onSelect={() => {
                    runAction(async () => {
                      const next = await moveNote(
                        currentNote.path,
                        query.trim().toLowerCase()
                      );

                      openNote(next);
                    });
                  }}
                  value="move-new"
                >
                  <FolderInputIcon />
                  new folder "{query.trim().toLowerCase()}"
                </CommandItem>
              )}
              <CommandItem
                onSelect={() => {
                  setView("root");
                }}
                value="cancel-move"
              >
                cancel
              </CommandItem>
            </CommandGroup>
          ) : null}

          {view === "rename" && currentNote !== undefined ? (
            <CommandGroup heading={`rename "${currentNote.title}"`}>
              {query.trim() === "" ? null : (
                <CommandItem
                  onSelect={() => {
                    runAction(async () => {
                      const next = await retitleNote(
                        currentNote.path,
                        query.trim()
                      );

                      openNote(next);
                    });
                  }}
                  value="confirm-rename"
                >
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
              <CommandItem
                onSelect={() => {
                  setView("root");
                }}
                value="cancel-rename"
              >
                cancel
              </CommandItem>
            </CommandGroup>
          ) : null}

          {view === "tags" && currentNote !== undefined ? (
            <CommandGroup heading={`tags for "${currentNote.title}"`}>
              {tagChoices.map((name) => {
                const attached = noteTags.tags.includes(name);

                return (
                  <CommandItem
                    data-checked={attached}
                    key={name}
                    onSelect={() => {
                      void noteTags.changeTags(
                        attached
                          ? noteTags.tags.filter(
                              (existing) => existing !== name
                            )
                          : [...noteTags.tags, name]
                      );
                    }}
                    value={`tag-${name}`}
                  >
                    <HashIcon />
                    <span className="flex-1 truncate">{name}</span>
                    <span className={COUNT_CLASS}>
                      {tagCounts.get(name) ?? 0}
                    </span>
                  </CommandItem>
                );
              })}
              {draftTag === "" || tagChoices.includes(draftTag) ? null : (
                <CommandItem
                  onSelect={() => {
                    setQuery("");
                    void noteTags.changeTags([...noteTags.tags, draftTag]);
                  }}
                  value="tag-new"
                >
                  <TagPlusIcon />
                  create "{draftTag}"
                </CommandItem>
              )}
              <CommandItem
                onSelect={() => {
                  setView("root");
                }}
                value="cancel-tags"
              >
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
                      <CommandItem
                        key={name}
                        onSelect={() => {
                          updateQuery(`#${name} `);
                        }}
                        value={`tag-${name}`}
                      >
                        <HashIcon />
                        <span className="flex-1 truncate">{name}</span>
                        <span className={COUNT_CLASS}>{count}</span>
                      </CommandItem>
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
                  <CommandItem
                    onSelect={() => {
                      runAction(async () => {
                        const path = await createNote();

                        openNote(path);
                      });
                    }}
                    value="new-note"
                  >
                    <FilePlusIcon />
                    new note
                  </CommandItem>
                ) : null}
                {currentNote !== undefined && matchesQuery("pin") ? (
                  <CommandItem
                    onSelect={() => {
                      runAction(() =>
                        setNotePinned(currentNote.path, !currentNote.pinned)
                      );
                    }}
                    value="toggle-pin"
                  >
                    <PinIcon />
                    {currentNote.pinned ? "unpin note" : "pin note"}
                  </CommandItem>
                ) : null}
                {currentNote !== undefined && matchesQuery("edit tags") ? (
                  <CommandItem
                    onSelect={() => {
                      setQuery("");
                      setView("tags");
                    }}
                    value="edit-tags"
                  >
                    <TagPlusIcon />
                    edit tags...
                  </CommandItem>
                ) : null}
                {currentNote !== undefined && matchesQuery("rename note") ? (
                  <CommandItem
                    onSelect={() => {
                      setQuery(currentNote.title);
                      setView("rename");
                    }}
                    value="rename-note"
                  >
                    <PencilIcon />
                    rename note...
                  </CommandItem>
                ) : null}
                {currentNote !== undefined && matchesQuery("move to folder") ? (
                  <CommandItem
                    onSelect={() => {
                      setQuery("");
                      setView("move");
                    }}
                    value="move-note"
                  >
                    <FolderInputIcon />
                    move to folder...
                  </CommandItem>
                ) : null}
                {currentNote !== undefined && matchesQuery("delete note") ? (
                  <CommandItem
                    onSelect={() => {
                      setView("delete");
                    }}
                    value="delete-note"
                  >
                    <Trash2Icon />
                    delete note...
                  </CommandItem>
                ) : null}
                {currentNote !== undefined &&
                matchesQuery("reveal in finder") ? (
                  <CommandItem
                    onSelect={() => {
                      runAction(() =>
                        revealItemInDir(`${notesDir}/${currentNote.path}`)
                      );
                    }}
                    value="reveal-in-finder"
                  >
                    <FolderSearchIcon />
                    reveal in finder
                  </CommandItem>
                ) : null}
                {matchesQuery("settings") ? (
                  <CommandItem
                    onSelect={() => {
                      close();
                      onOpenSettings();
                    }}
                    value="settings"
                  >
                    <SettingsIcon />
                    settings
                  </CommandItem>
                ) : null}
                {matchesQuery("reindex library") ? (
                  <CommandItem
                    onSelect={() => {
                      runAction(async () => {
                        await reindexAll();
                        toast.success("library reindexed");
                      });
                    }}
                    value="reindex"
                  >
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
