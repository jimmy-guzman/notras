import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
import {
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  HashIcon,
  PinIcon,
} from "lucide-react";
import { useCallback } from "react";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { filenameFromTitle, type NoteMeta } from "@/core/notes";
import {
  insertSearchFilter,
  parseSearch,
  searchFolders,
  searchSuggestion,
} from "@/core/search";
import { noteQueries } from "@/data/queries";
import { reasonOf } from "@/lib/ui/failure";
import { getSnippetParts } from "@/lib/utils/fts-snippet";

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

function folderLabel(folder: string) {
  return folder === "/" ? "notes root" : folder;
}

interface PaletteSearchProps {
  allTags: { count: number; tag: string }[];
  notes: NoteMeta[];
  onCreate: () => void;
  onQueryChange: (query: string) => void;
  onSelectNote: (path: string) => void;
  query: string;
}

export function PaletteSearch({
  allTags,
  notes,
  onCreate,
  onQueryChange,
  onSelectNote,
  query,
}: PaletteSearchProps) {
  const [debounced] = useDebouncedValue(query, { wait: 150 });
  const search = parseSearch(query);
  const idle = query.trim() === "";
  const result = useQuery({
    ...noteQueries.search(parseSearch(debounced)),
    enabled: !(idle || parseSearch(debounced).incomplete),
  });
  const pending =
    !idle && (debounced !== query || result.isPending || result.isFetching);
  const visible = (() => {
    if (idle) {
      return notes.slice(0, 20);
    }
    if (search.incomplete || pending || result.isError) {
      return [];
    }
    return result.data ?? [];
  })();
  const suggestion = searchSuggestion(query);
  const pickFolder = useCallback(
    (value: string) =>
      onQueryChange(
        insertSearchFilter(query, { kind: "folder", value: value.slice(7) })
      ),
    [onQueryChange, query]
  );
  const pickTag = useCallback(
    (value: string) =>
      onQueryChange(
        insertSearchFilter(query, { kind: "tag", value: value.slice(4) })
      ),
    [onQueryChange, query]
  );
  const chooseFilter = useCallback(
    (value: string) =>
      onQueryChange(`${query.trimEnd()}${idle ? "" : " "}${value}`),
    [idle, onQueryChange, query]
  );
  const offerCreate =
    !(idle || pending || search.incomplete) &&
    result.isSuccess &&
    search.filters.length === 0 &&
    visible.length === 0;
  const status = (() => {
    if (search.incomplete) {
      return {
        description: "complete the filter or choose a suggestion",
        title: "incomplete filter",
      };
    }
    if (pending) {
      return { description: undefined, title: "searching notes" };
    }
    if (result.isError && !idle) {
      return {
        description: reasonOf(result.error),
        title: "could not search notes",
      };
    }
    return {
      description: "choose a filter to narrow your search",
      title: "nothing found",
    };
  })();

  return (
    <>
      {visible.length === 0 && !offerCreate ? (
        <Empty className="p-6" role="status">
          <EmptyHeader>
            <EmptyTitle>{status.title}</EmptyTitle>
            {status.description === undefined ? null : (
              <EmptyDescription>{status.description}</EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
      ) : null}
      <CommandGroup heading="notes">
        {visible.map((note) => (
          <NoteItem key={note.path} note={note} onSelect={onSelectNote} />
        ))}
        {offerCreate ? (
          <CommandItem onSelect={onCreate} value="create-note">
            <FilePlusIcon />
            <span className="truncate">
              create "{query.trim()}"{" "}
              <span className="text-muted-foreground">
                · {filenameFromTitle(query.trim())}.md
              </span>
            </span>
          </CommandItem>
        ) : null}
      </CommandGroup>
      {suggestion?.kind === "folder" ? (
        <CommandGroup heading="folders">
          {searchFolders(notes)
            .filter(({ folder }) =>
              folder.toLowerCase().includes(suggestion.value.toLowerCase())
            )
            .map(({ count, folder }) => (
              <CommandItem
                key={folder}
                onSelect={pickFolder}
                value={`folder-${folder}`}
              >
                <FolderIcon />
                <span className="flex-1 truncate">{folderLabel(folder)}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {count}
                </span>
              </CommandItem>
            ))}
        </CommandGroup>
      ) : null}
      {suggestion?.kind === "tag" ? (
        <CommandGroup heading="tags">
          {allTags
            .filter(({ tag }) => tag.includes(suggestion.value))
            .map(({ count, tag }) => (
              <CommandItem key={tag} onSelect={pickTag} value={`tag-${tag}`}>
                <HashIcon />
                <span className="flex-1 truncate">{tag}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {count}
                </span>
              </CommandItem>
            ))}
        </CommandGroup>
      ) : null}
      <CommandGroup heading="search by">
        <CommandItem onSelect={chooseFilter} value="folder:">
          <FolderIcon />
          folder
        </CommandItem>
        <CommandItem onSelect={chooseFilter} value="#">
          <HashIcon />
          tag
        </CommandItem>
      </CommandGroup>
    </>
  );
}
