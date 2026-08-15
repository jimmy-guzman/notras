import { useNavigate, useParams } from "@tanstack/react-router";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderInputIcon,
  FolderSearchIcon,
  HashIcon,
  PinIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

import type { NoteMeta } from "@/core";

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
import { createNote } from "@/data/create-note";
import { deleteNote } from "@/data/delete-note";
import { getNotes } from "@/data/get-notes";
import { moveNote } from "@/data/move-note";
import { reindexAll } from "@/data/notes-dir";
import { setNotePinned } from "@/data/pin-note";
import { getSnippetParts } from "@/lib/utils/fts-snippet";

function Snippet({ snippet }: { snippet: string }) {
  return (
    <span className="truncate text-xs text-muted-foreground">
      {getSnippetParts(snippet).map((part) => {
        return part.match ? (
          <mark
            className="rounded-xs bg-primary/20 text-foreground"
            key={part.id}
          >
            {part.text}
          </mark>
        ) : (
          <span key={part.id}>{part.text}</span>
        );
      })}
    </span>
  );
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
            <span className="text-xs text-muted-foreground">{note.folder}</span>
          )}
        </span>
        {note.snippet === null ? null : <Snippet snippet={note.snippet} />}
      </div>
    </CommandItem>
  );
}

type PaletteView = "delete" | "move" | "root";

interface CommandPaletteProps {
  folders: { count: number; folder: string }[];
  notes: NoteMeta[];
  notesDir: string;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  open: boolean;
}

export function CommandPalette({
  folders,
  notes,
  notesDir,
  onOpenChange,
  onOpenSettings,
  open,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const currentPath = params._splat;
  const currentNote = notes.find((note) => {
    return note.path === currentPath;
  });

  const [query, setQuery] = useState("");
  const [view, setView] = useState<PaletteView>("root");
  const [results, setResults] = useState<NoteMeta[] | null>(null);

  const search = useDebouncedCallback(async (value: string) => {
    if (value.trim() === "" || value.startsWith("#")) {
      setResults(null);

      return;
    }

    try {
      setResults(await getNotes({ limit: 30, query: value }));
    } catch {
      setResults([]);
    }
  }, 150);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery("");
      setView("root");
      setResults(null);
    }

    onOpenChange(next);
  };

  const tagFilter = query.startsWith("#")
    ? query.slice(1).trim().toLowerCase()
    : undefined;

  const visibleNotes = useMemo(() => {
    if (tagFilter !== undefined) {
      return notes.filter((note) => {
        return note.tags.some((tag) => {
          return tag.includes(tagFilter);
        });
      });
    }

    if (results !== null) {
      return results;
    }

    return notes.slice(0, 20);
  }, [notes, results, tagFilter]);

  const allTags = useMemo(() => {
    return [
      ...new Set(
        notes.flatMap((note) => {
          return note.tags;
        }),
      ),
    ].toSorted();
  }, [notes]);

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
        error instanceof Error ? error.message : "something went wrong",
      );
    });
  };

  const matchesQuery = (label: string) => {
    return (
      tagFilter === undefined &&
      label.toLowerCase().includes(query.trim().toLowerCase())
    );
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
          onValueChange={(value) => {
            setQuery(value);
            void search(value);
          }}
          placeholder={
            view === "move"
              ? "move to folder... (type a new name to create it)"
              : "search notes, # for tags..."
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
                .filter(({ folder }) => {
                  return folder.includes(query.trim().toLowerCase());
                })
                .map(({ count, folder }) => {
                  return (
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
                      {folder}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {count}
                      </span>
                    </CommandItem>
                  );
                })}
              {query.trim() === "" ? null : (
                <CommandItem
                  onSelect={() => {
                    runAction(async () => {
                      const next = await moveNote(
                        currentNote.path,
                        query.trim().toLowerCase(),
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
            </CommandGroup>
          ) : null}

          {view === "root" ? (
            <>
              <CommandEmpty>nothing found.</CommandEmpty>
              <CommandGroup heading="notes">
                {visibleNotes.map((note) => {
                  return (
                    <NoteItem key={note.path} note={note} onSelect={openNote} />
                  );
                })}
              </CommandGroup>
              {tagFilter === undefined ? null : (
                <CommandGroup heading="tags">
                  {allTags
                    .filter((tag) => {
                      return tag.includes(tagFilter);
                    })
                    .map((tag) => {
                      return (
                        <CommandItem
                          key={tag}
                          onSelect={() => {
                            setQuery(`#${tag}`);
                          }}
                          value={`tag-${tag}`}
                        >
                          <HashIcon />
                          {tag}
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              )}
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
                      runAction(() => {
                        return setNotePinned(
                          currentNote.path,
                          !currentNote.pinned,
                        );
                      });
                    }}
                    value="toggle-pin"
                  >
                    <PinIcon />
                    {currentNote.pinned ? "unpin note" : "pin note"}
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
                      runAction(() => {
                        return revealItemInDir(
                          `${notesDir}/${currentNote.path}`,
                        );
                      });
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
