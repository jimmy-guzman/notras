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
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { filenameFromTitle, type NoteMeta } from "@/core/notes";
import {
  insertSearchFilter,
  parseSearch,
  type SearchFilter,
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
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate" title={note.path}>
            {note.title}
          </span>
          {note.pinned ? <PinIcon className="size-3 opacity-60" /> : null}
          {note.folder === "" ? null : (
            <span
              className="max-w-1/3 shrink-0 truncate text-muted-foreground text-xs"
              title={note.path}
            >
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

interface PickerChoice {
  count?: number;
  detail?: string;
  label: string;
  value: string;
}

function pickerChoices(
  filter: SearchFilter | undefined,
  notes: NoteMeta[],
  tags: { count: number; tag: string }[]
) {
  if (filter === undefined) {
    return;
  }
  const choices: PickerChoice[] = (() => {
    switch (filter.kind) {
      case "folder":
        return searchFolders(notes).map(({ count, folder }) => ({
          count,
          label: folderLabel(folder),
          value: folder,
        }));
      case "tag":
        return tags.map(({ count, tag }) => ({
          count,
          label: tag,
          value: tag,
        }));
      case "to":
      case "from":
        return notes.map(({ path, title }) => ({
          detail: path,
          label: title,
          value: path,
        }));
      default:
        return [];
    }
  })();
  if (choices.some(({ value }) => value === filter.value)) {
    return;
  }
  const presentation = (() => {
    switch (filter.kind) {
      case "folder":
        return { heading: "folders", Icon: FolderIcon };
      case "tag":
        return { heading: "tags", Icon: HashIcon };
      default:
        return { heading: "notes to filter by", Icon: FileTextIcon };
    }
  })();
  return {
    ...presentation,
    choices: choices.filter(({ label, value }) =>
      `${label} ${value}`.toLowerCase().includes(filter.value.toLowerCase())
    ),
  };
}

function filterHelp(kind: SearchFilter["kind"] | undefined) {
  if (kind === "mention") {
    return 'type a phrase, for example mention:"Ada Lovelace"';
  }
  if (kind === "link") {
    return "type part of a destination, for example link:github.com";
  }
  return "type a folder, tag, or note to filter by";
}

interface PaletteSearchProps {
  allTags: { count: number; tag: string }[];
  cursor?: number;
  notes: NoteMeta[];
  onCreate: () => void;
  onQueryChange: (query: string) => void;
  onSelectNote: (path: string) => void;
  query: string;
}

export function PaletteSearch({
  allTags,
  cursor,
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
  const pending = !idle && (debounced !== query || result.isPending);
  const visible = (() => {
    if (idle) {
      return notes.slice(0, 20);
    }
    if (search.incomplete || pending || result.isError) {
      return [];
    }
    return result.data ?? [];
  })();
  const candidate = searchSuggestion(query, cursor);
  const picker = pickerChoices(candidate, notes, allTags);
  const showPicker =
    picker !== undefined && picker.choices.length > 0 && !result.isError;
  const pickFilter = useCallback(
    (value: string) => {
      if (candidate !== undefined) {
        onQueryChange(
          insertSearchFilter(query, { kind: candidate.kind, value }, cursor)
        );
      }
    },
    [candidate, cursor, onQueryChange, query]
  );
  const stopCommandKeys = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "Escape") {
      event.stopPropagation();
    }
  }, []);
  const retry = useCallback(async () => {
    await result.refetch();
  }, [result]);
  const offerCreate =
    !(idle || pending || search.incomplete) &&
    result.isSuccess &&
    search.filters.length === 0 &&
    visible.length === 0;
  const status = (() => {
    if (search.incomplete) {
      return {
        description: filterHelp(candidate?.kind),
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
      description: idle
        ? "create a note with the new note action"
        : "try different words or remove a filter",
      title: "nothing found",
    };
  })();

  return (
    <>
      {!showPicker && visible.length === 0 && !offerCreate ? (
        <Empty className="p-6" role="status">
          <EmptyHeader>
            <EmptyTitle>{status.title}</EmptyTitle>
            {status.description === undefined ? null : (
              <EmptyDescription>{status.description}</EmptyDescription>
            )}
          </EmptyHeader>
          {result.isError && !idle && !search.incomplete ? (
            <EmptyContent onKeyDown={stopCommandKeys}>
              <Button onClick={retry} size="sm" variant="outline">
                retry
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : null}
      {!showPicker && (visible.length > 0 || offerCreate) ? (
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
      ) : null}
      {showPicker ? (
        <CommandGroup heading={picker.heading}>
          {picker.choices.map(({ count, detail, label, value }) => (
            <CommandItem key={value} onSelect={pickFilter} value={value}>
              <picker.Icon />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{label}</span>
                {detail === undefined ? null : (
                  <span className="truncate text-muted-foreground text-xs">
                    {detail}
                  </span>
                )}
              </div>
              {count === undefined ? null : (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {count}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
    </>
  );
}
