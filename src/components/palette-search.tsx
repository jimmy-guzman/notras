import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
import { FilePlusIcon, FileTextIcon, FolderIcon, HashIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLayoutEffect, useState } from "react";

import { Highlighted, NoteLabel } from "@/components/notes/note-label";
import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { filenameFromTitle } from "@/core/notes";
import type { NoteMeta } from "@/core/notes";
import {
  insertSearchFilter,
  parseSearch,
  searchFolders,
  searchSuggestion,
} from "@/core/search";
import type { SearchFilter } from "@/core/search";
import { indexStatusQuery } from "@/data/index-status";
import { noteQueries } from "@/data/queries";
import { reasonOf } from "@/lib/ui/failure";

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
  const select = () => {
    if (!disabled) {
      onSelect(note.path);
    }
  };

  return (
    <CommandItem disabled={disabled} onSelect={select} value={note.path}>
      <FileTextIcon />
      <div className="flex min-w-0 flex-1 flex-col">
        <NoteLabel note={note}>
          {note.tags.length === 0 ? null : (
            <span className="text-muted-foreground truncate text-xs">
              {tagLabel(note.tags)}
            </span>
          )}
        </NoteLabel>
        {note.snippet === null ? null : (
          <Highlighted
            className="text-muted-foreground truncate text-xs"
            text={note.snippet}
          />
        )}
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

const NOTES_TO_FILTER = { Icon: FileTextIcon, heading: "notes to filter by" };

const PRESENTATION: Record<
  SearchFilter["kind"],
  { Icon: LucideIcon; heading: string }
> = {
  folder: { Icon: FolderIcon, heading: "folders" },
  from: NOTES_TO_FILTER,
  link: NOTES_TO_FILTER,
  mention: NOTES_TO_FILTER,
  tag: { Icon: HashIcon, heading: "tags" },
  to: NOTES_TO_FILTER,
};
function pickerChoices(
  filter: SearchFilter,
  notes: NoteMeta[],
  tags: { count: number; tag: string }[]
) {
  const choices: PickerChoice[] = (() => {
    if (filter.kind === "folder") {
      return searchFolders(notes).map(({ count, folder }) => ({
        count,
        label: folderLabel(folder),
        value: folder,
      }));
    }
    if (filter.kind === "tag") {
      return tags.map(({ count, tag }) => ({
        count,
        label: tag,
        value: tag,
      }));
    }
    if (filter.kind === "to" || filter.kind === "from") {
      return notes.map(({ path, title }) => ({
        detail: path,
        label: title,
        value: path,
      }));
    }
    return [];
  })();
  const taken = choices.some(({ value }) => value === filter.value);
  const presentation = PRESENTATION[filter.kind];
  const offered = choices.filter(({ label, value }) =>
    `${label} ${value}`.toLowerCase().includes(filter.value.toLowerCase())
  );
  return taken || offered.length === 0
    ? undefined
    : { ...presentation, choices: offered };
}

function filterHelp(kind: SearchFilter["kind"] | undefined) {
  if (kind === "mention") {
    return 'Type a phrase, for example mention:"Ada Lovelace"';
  }
  if (kind === "link") {
    return "Type part of a destination, for example link:github.com";
  }
  return "Type a folder, tag, or note to filter by";
}

const NO_NOTES: NoteMeta[] = [];

function stopCommandKeys(event: React.KeyboardEvent) {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

function useDisplayedNotes(
  currentNotes: NoteMeta[],
  idle: boolean,
  pending: boolean,
  query: string
) {
  const readyNotes = idle ? currentNotes.slice(0, 20) : currentNotes;
  const [displayed, setDisplayed] = useState({
    from: currentNotes,
    idle,
    notes: readyNotes,
    query,
  });
  if (
    !pending &&
    (displayed.from !== currentNotes ||
      displayed.idle !== idle ||
      displayed.query !== query)
  ) {
    setDisplayed({ from: currentNotes, idle, notes: readyNotes, query });
  }
  return {
    resultQuery: pending ? displayed.query : query,
    visible: pending ? displayed.notes : readyNotes,
  };
}

function useSearchResults(query: string, showPicker: boolean) {
  const [debounced] = useDebouncedValue(query, { wait: 150 });
  const search = parseSearch(query);
  const idle = query.trim() === "";
  const recent = useQuery({
    ...noteQueries.list({ limit: 20 }),
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
  const { resultQuery, visible } = useDisplayedNotes(
    currentNotes,
    idle,
    pending,
    query
  );
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
  const picker =
    candidate === undefined
      ? undefined
      : pickerChoices(candidate, suggestions.data ?? NO_NOTES, tags.data ?? []);
  const retryChoices = async () => {
    await choicesQuery.refetch();
  };
  return { choicesFailed, choicesPending, choicesQuery, picker, retryChoices };
}

interface NoteResultsProps {
  candidate: ReturnType<typeof searchSuggestion>;
  onCreate: () => void;
  onSelectNote: (path: string) => void;
  query: string;
  results: ReturnType<typeof useSearchResults>;
}

function NoteResults({
  candidate,
  onCreate,
  onSelectNote,
  query,
  results,
}: NoteResultsProps) {
  const search = parseSearch(query);
  const idle = query.trim() === "";
  const { failed, pending, result, resultQuery, visible } = results;
  const retry = async () => {
    await result.refetch();
  };
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
    if (failed) {
      return {
        description: reasonOf(result.error),
        title: "could not search notes",
      };
    }
    return {
      description: idle
        ? "Create a note with the new note action"
        : "Try different words or remove a filter",
      title: "nothing found",
    };
  })();

  return (
    <>
      {!pending && (visible.length === 0 || failed) && !offerCreate ? (
        <Empty aria-live="polite">
          <EmptyHeader>
            <EmptyTitle>{status.title}</EmptyTitle>
            <EmptyDescription>{status.description}</EmptyDescription>
          </EmptyHeader>
          {failed && !search.incomplete ? (
            <EmptyContent onKeyDown={stopCommandKeys}>
              <Button
                onClick={() => {
                  void retry();
                }}
                size="sm"
                variant="outline"
              >
                retry
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : null}
      {visible.length > 0 || offerCreate ? (
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
                create &quot;{query.trim()}&quot;
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {filenameFromTitle(query.trim())}.md
              </span>
            </CommandItem>
          ) : null}
        </CommandGroup>
      ) : null}
    </>
  );
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
  onSelectNote,
  onResultQueryChange,
  query,
}: PaletteSearchProps) {
  const candidate = searchSuggestion(query, cursor);
  const { choicesFailed, choicesPending, choicesQuery, picker, retryChoices } =
    useFilterChoices(candidate);
  const showPicker = picker !== undefined;
  const choosingFilter = showPicker || choicesPending || choicesFailed;
  const results = useSearchResults(query, choosingFilter);
  const { indexing, pending, readingQuery, resultQuery } = results;
  useLayoutEffect(() => {
    // oxlint-disable-next-line react-doctor/no-prop-callback-in-effect -- the parent resets its list's scroll position and sets no state
    onResultQueryChange?.(resultQuery);
  }, [onResultQueryChange, resultQuery]);
  useLayoutEffect(() => {
    onLoadingChange?.(false);
    const timer = setTimeout(() => {
      if (readingQuery !== undefined) {
        onLoadingChange?.(true);
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      onLoadingChange?.(false);
    };
  }, [onLoadingChange, readingQuery]);
  const pickFilter = (value: string) => {
    if (candidate !== undefined) {
      onQueryChange(
        insertSearchFilter(query, { kind: candidate.kind, value }, cursor)
      );
    }
  };

  return (
    <div aria-busy={pending || choicesPending}>
      {choicesPending ? (
        <output className="text-muted-foreground block p-4 text-sm">
          loading suggestions...
        </output>
      ) : null}
      {choicesFailed ? (
        <output className="block p-4 text-sm">
          <span className="block">could not load suggestions</span>
          <span className="block">{reasonOf(choicesQuery.error)}</span>
          <Button
            onClick={() => {
              void retryChoices();
            }}
            size="sm"
            variant="ghost"
          >
            retry
          </Button>
        </output>
      ) : null}
      {indexing ? (
        <output className="text-muted-foreground block p-4 text-sm">
          indexing notes...
        </output>
      ) : null}
      {choosingFilter ? null : (
        <NoteResults
          candidate={candidate}
          onCreate={onCreate}
          onSelectNote={onSelectNote}
          query={query}
          results={results}
        />
      )}
      {showPicker ? (
        <CommandGroup heading={picker.heading}>
          {picker.choices.map(({ count, detail, label, value }) => (
            <CommandItem key={value} onSelect={pickFilter} value={value}>
              <picker.Icon />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{label}</span>
                {detail === undefined ? null : (
                  <span className="text-muted-foreground truncate text-xs">
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
