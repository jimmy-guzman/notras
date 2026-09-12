import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
import {
  FilePlusIcon,
  FileTextIcon,
  FolderIcon,
  HashIcon,
  PinIcon,
} from "lucide-react";
import { useCallback, useLayoutEffect, useState } from "react";
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
import { indexStatusQuery, noteQueries } from "@/data/queries";
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
  disabled: boolean;
  note: NoteMeta;
  onSelect: (path: string) => void;
}

function NoteItem({ disabled, note, onSelect }: NoteItemProps) {
  const select = useCallback(() => {
    if (!disabled) {
      onSelect(note.path);
    }
  }, [disabled, note.path, onSelect]);

  return (
    <CommandItem
      className="data-[disabled=true]:opacity-100"
      disabled={disabled}
      onSelect={select}
      value={note.path}
    >
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

const NO_NOTES: NoteMeta[] = [];

function stopCommandKeys(event: React.KeyboardEvent) {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

function emptyStatus(state: {
  candidate: SearchFilter["kind"] | undefined;
  error: unknown;
  failed: boolean;
  idle: boolean;
  incomplete: boolean;
  indexing: boolean;
}) {
  if (state.indexing) {
    return {
      description: "search opens when the index is ready",
      title: "indexing notes",
    };
  }
  if (state.incomplete) {
    return {
      description: filterHelp(state.candidate),
      title: "incomplete filter",
    };
  }
  if (state.failed) {
    return {
      description: reasonOf(state.error),
      title: "could not search notes",
    };
  }
  return {
    description: state.idle
      ? "create a note with the new note action"
      : "try different words or remove a filter",
    title: "nothing found",
  };
}

function useSearchResults(query: string, showPicker: boolean) {
  const [debounced] = useDebouncedValue(query, { wait: 150 });
  const search = parseSearch(query);
  const idle = query.trim() === "";
  const recent = useQuery({
    ...noteQueries.list({ limit: 20, sort: "updated" }),
    enabled: idle,
  });
  const searched = useQuery({
    ...noteQueries.search(parseSearch(debounced)),
    enabled: !(idle || search.incomplete || showPicker) && debounced === query,
  });
  const result = idle ? recent : searched;
  const showingResults = !(search.incomplete || showPicker);
  const waitingForDebounce = !idle && debounced !== query;
  const pending = showingResults && (waitingForDebounce || result.isPending);
  const failed = (idle || debounced === query) && result.isError;
  const currentNotes =
    search.incomplete || showPicker ? NO_NOTES : (result.data ?? NO_NOTES);
  const [displayed, setDisplayed] = useState({
    notes: idle ? currentNotes.slice(0, 20) : NO_NOTES,
    query,
  });
  useLayoutEffect(() => {
    if (!pending) {
      setDisplayed({
        notes: idle ? currentNotes.slice(0, 20) : currentNotes,
        query,
      });
    }
  }, [currentNotes, idle, pending, query]);
  const readyNotes = idle ? currentNotes.slice(0, 20) : currentNotes;
  const visible = pending ? displayed.notes : readyNotes;
  const resultQuery = pending ? displayed.query : query;
  const reading = showingResults && !waitingForDebounce && result.isFetching;
  const indexStatus = useQuery(indexStatusQuery);
  const indexing =
    pending && visible.length === 0 && indexStatus.data?.state === "scanning";
  return {
    failed,
    indexing,
    pending,
    readingQuery: reading ? query : undefined,
    result,
    resultQuery,
    visible,
  };
}

/** Report a read that stays pending for 500ms, and clear it when it settles or changes. */
function useLoadingSignal(
  readingQuery: string | undefined,
  onLoadingChange: ((loading: boolean) => void) | undefined
) {
  useLayoutEffect(() => {
    onLoadingChange?.(false);
    if (readingQuery === undefined) {
      return;
    }
    const timer = setTimeout(() => onLoadingChange?.(true), 500);
    return () => {
      clearTimeout(timer);
      onLoadingChange?.(false);
    };
  }, [onLoadingChange, readingQuery]);
}

function useFilterChoices(candidate: ReturnType<typeof searchSuggestion>) {
  const suggestions = useQuery({
    ...noteQueries.list(),
    enabled:
      candidate !== undefined &&
      ["folder", "to", "from"].includes(candidate.kind),
  });
  const tags = useQuery({
    ...noteQueries.tags(),
    enabled: candidate?.kind === "tag",
  });
  const choicesQuery = candidate?.kind === "tag" ? tags : suggestions;
  const needsChoices =
    candidate !== undefined &&
    ["folder", "to", "from", "tag"].includes(candidate.kind);
  const choicesPending =
    needsChoices && choicesQuery.data === undefined && choicesQuery.isPending;
  const choicesFailed =
    needsChoices && choicesQuery.data === undefined && choicesQuery.isError;
  const picker = pickerChoices(
    candidate,
    suggestions.data ?? NO_NOTES,
    tags.data ?? []
  );
  const retryChoices = useCallback(async () => {
    await choicesQuery.refetch();
  }, [choicesQuery]);
  return { choicesFailed, choicesPending, choicesQuery, picker, retryChoices };
}

interface PaletteSearchProps {
  cursor?: number;
  onCreate: () => void;
  onLoadingChange?: (loading: boolean) => void;
  onQueryChange: (query: string) => void;
  onResultQueryChange?: (query: string) => void;
  onSelectNote: (path: string) => void;
  query: string;
}

export function PaletteSearch({
  cursor,
  onCreate,
  onLoadingChange,
  onQueryChange,
  onResultQueryChange,
  onSelectNote,
  query,
}: PaletteSearchProps) {
  const search = parseSearch(query);
  const idle = query.trim() === "";
  const candidate = searchSuggestion(query, cursor);
  const { choicesFailed, choicesPending, choicesQuery, picker, retryChoices } =
    useFilterChoices(candidate);
  const showPicker = picker !== undefined && picker.choices.length > 0;
  const choosingFilter = showPicker || choicesPending || choicesFailed;
  const {
    failed,
    indexing,
    pending,
    readingQuery,
    result,
    resultQuery,
    visible,
  } = useSearchResults(query, choosingFilter);
  useLayoutEffect(() => {
    onResultQueryChange?.(resultQuery);
  }, [onResultQueryChange, resultQuery]);
  useLoadingSignal(readingQuery, onLoadingChange);
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
  const retry = useCallback(async () => {
    await result.refetch();
  }, [result]);
  const offerCreate =
    !(idle || pending || search.incomplete) &&
    result.isSuccess &&
    search.filters.length === 0 &&
    visible.length === 0;
  const empty =
    !choosingFilter &&
    (indexing || !pending) &&
    (visible.length === 0 || failed) &&
    !offerCreate;
  const status = emptyStatus({
    candidate: candidate?.kind,
    error: result.error,
    failed,
    idle,
    incomplete: search.incomplete,
    indexing,
  });

  return (
    <div aria-busy={pending || choicesPending}>
      {choicesPending ? (
        <p className="p-4 text-muted-foreground text-sm" role="status">
          loading suggestions...
        </p>
      ) : null}
      {choicesFailed ? (
        <div className="p-4 text-sm" role="status">
          <p>could not load suggestions</p>
          <p>{reasonOf(choicesQuery.error)}</p>
          <Button onClick={retryChoices} size="sm" variant="ghost">
            retry
          </Button>
        </div>
      ) : null}
      {empty ? (
        <Empty className="p-6" role="status">
          <EmptyHeader>
            <EmptyTitle>{status.title}</EmptyTitle>
            <EmptyDescription>{status.description}</EmptyDescription>
          </EmptyHeader>
          {failed && !search.incomplete ? (
            <EmptyContent onKeyDown={stopCommandKeys}>
              <Button onClick={retry} size="sm" variant="outline">
                retry
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : null}
      {!choosingFilter && (visible.length > 0 || offerCreate) ? (
        <CommandGroup heading="notes" key={resultQuery}>
          {visible.map((note) => (
            <NoteItem
              disabled={pending}
              key={note.path}
              note={note}
              onSelect={onSelectNote}
            />
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
    </div>
  );
}
