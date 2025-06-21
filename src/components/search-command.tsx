"use client";

import { format } from "date-fns";
import { ArrowLeft, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "use-debounce";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearch } from "@/hooks/use-search";
import { KIND_LABELS, KIND_VALUES } from "@/lib/kind";
import { getHighlightedParts } from "@/lib/utils/highlight";
import { truncate } from "@/lib/utils/truncate";

import { Kbd } from "./kbd";

const SEARCH_CONFIG = {
  DEBOUNCE_DELAY: 300,
  DEDUPING_INTERVAL: 2000,
  MAX_CONTENT_LENGTH: 60,
  RESULTS_HEIGHT: 300,
} as const;

interface FilterState {
  label?: string;
  type: "home" | "kind" | "time";
  value?: string;
}

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [currentFilter, setCurrentFilter] = useState<FilterState>({
    type: "home",
  });
  const router = useRouter();

  const [debouncedQuery] = useDebounce(query, SEARCH_CONFIG.DEBOUNCE_DELAY);

  const { error, isLoading, notes } = useSearch(debouncedQuery, currentFilter);

  const resetSearchState = useCallback(() => {
    setQuery("");
    setCurrentFilter({ type: "home" });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }

      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelectNote = (noteId: string) => {
    router.push(`/notes/${noteId}`);
    setOpen(false);
  };

  const handleFilterSelect = (
    type: "kind" | "time",
    value: string,
    label: string,
  ) => {
    setCurrentFilter({ label, type, value });
    setQuery("");
  };

  const handleBackToHome = () => {
    setCurrentFilter({ type: "home" });
    setQuery("");
  };

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);

      if (!isOpen) {
        resetSearchState();
      }
    },
    [resetSearchState],
  );

  const getEmptyText = () => {
    if (error) {
      if (
        error.message.includes("fetch") ||
        error.message.includes("network")
      ) {
        return "Unable to search right now";
      }

      return "Search temporarily unavailable";
    }

    return query || currentFilter.value
      ? "No results found"
      : "No results found.";
  };

  const emptyText = getEmptyText();

  const isTyping = query !== debouncedQuery && query.trim().length > 0;
  const showFilters = currentFilter.type === "home" && !query;
  const showResults = notes.length > 0 || isLoading || isTyping;
  const showBackButton = currentFilter.type !== "home";
  const isSearching = (isLoading || isTyping) && notes.length === 0;

  return (
    <>
      <Button
        className="text-muted-foreground relative h-9 w-auto justify-start rounded-[0.5rem] text-sm md:w-40 md:pr-12 lg:w-64"
        onClick={() => {
          setOpen(true);
        }}
        variant="outline"
      >
        <Search className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline-flex lg:hidden">Search...</span>
        <span className="hidden lg:inline-flex">Search notes...</span>

        <div className="absolute top-[0.45rem] right-[0.3rem] hidden gap-0.5 sm:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </div>
      </Button>

      <CommandDialog onOpenChange={handleOpenChange} open={open}>
        {showBackButton && (
          <div className="text-muted-foreground flex items-center gap-2 border-b px-3 py-2 text-sm">
            <Button
              className="h-6 px-2"
              onClick={handleBackToHome}
              size="sm"
              variant="ghost"
            >
              <ArrowLeft className="mr-1 h-3 w-3" />
              Back
            </Button>
            <span>→</span>
            <span className="capitalize">{currentFilter.label}</span>
          </div>
        )}

        <CommandInput
          aria-label="Search notes by content, kind, or time"
          onValueChange={setQuery}
          placeholder={
            currentFilter.type === "home"
              ? "Search notes or browse by kind/time..."
              : `Search in ${currentFilter.label?.toLowerCase()}...`
          }
          role="searchbox"
          value={query}
        />
        <CommandList style={{ height: `${SEARCH_CONFIG.RESULTS_HEIGHT}px` }}>
          {isSearching ? (
            <CommandGroup>
              {/* eslint-disable-next-line no-magic-numbers -- TODO: use composition*/}
              {[1, 2, 3].map((i) => {
                return (
                  <div className="flex flex-col items-start gap-1 p-3" key={i}>
                    <div className="flex w-full items-start justify-between">
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </div>
                  </div>
                );
              })}
            </CommandGroup>
          ) : (
            <CommandEmpty>{emptyText}</CommandEmpty>
          )}

          {showResults && notes.length > 0 && (
            <CommandGroup
              heading={
                currentFilter.type === "home"
                  ? "Notes"
                  : `${currentFilter.label} Notes`
              }
            >
              {notes.map((note) => {
                const highlightedContent = getHighlightedParts(
                  truncate(note.content, SEARCH_CONFIG.MAX_CONTENT_LENGTH),
                  debouncedQuery,
                );

                return (
                  <CommandItem
                    className="flex flex-col items-start gap-1 p-3"
                    key={note.id}
                    onSelect={() => {
                      handleSelectNote(note.id);
                    }}
                  >
                    <div className="flex w-full items-start justify-between">
                      <span className="font-medium">
                        {highlightedContent.map((part) => {
                          return (
                            <span
                              className={
                                part.match
                                  ? "bg-yellow-200 dark:bg-yellow-800/50"
                                  : ""
                              }
                              key={part.id}
                            >
                              {part.text}
                            </span>
                          );
                        })}
                      </span>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span>
                        {format(new Date(note.createdAt), "MMM d, yyyy")}
                      </span>
                      <Badge className="text-xs capitalize" variant="outline">
                        {KIND_LABELS[note.kind ?? "thought"]}
                        {note.metadata?.aiKindInferred && (
                          <Sparkles className="ml-1 h-2 w-2" />
                        )}
                      </Badge>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {showFilters && (
            <>
              <CommandGroup heading="Browse by Kind">
                {KIND_VALUES.map((kind) => {
                  return (
                    <CommandItem
                      className="flex items-center gap-2"
                      key={kind}
                      onSelect={() => {
                        handleFilterSelect("kind", kind, KIND_LABELS[kind]);
                      }}
                    >
                      <Search className="h-4 w-4" />
                      <span className="capitalize">{KIND_LABELS[kind]}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              <CommandGroup heading="Browse by Time">
                <CommandItem
                  onSelect={() => {
                    handleFilterSelect("time", "today", "Today");
                  }}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Today
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    handleFilterSelect("time", "yesterday", "Yesterday");
                  }}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Yesterday
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    handleFilterSelect("time", "week", "This Week");
                  }}
                >
                  <Search className="mr-2 h-4 w-4" />
                  This week
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    handleFilterSelect("time", "month", "This Month");
                  }}
                >
                  <Search className="mr-2 h-4 w-4" />
                  This month
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
