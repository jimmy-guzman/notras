"use client";

import { Calendar, Filter, SearchIcon, XIcon } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useRef, useState } from "react";

import type { NoteSearchParams } from "@/lib/notes-search-params";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { parsers } from "@/lib/notes-search-params";

interface TimeSelectProps {
  onChange: (time: NoteSearchParams["time"]) => void;
  value: NoteSearchParams["time"];
}

const TimeSelect = ({ onChange, value }: TimeSelectProps) => {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="text-muted-foreground h-4 w-4" />
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full md:w-40">
          <SelectValue placeholder="All time" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All time</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="week">This week</SelectItem>
          <SelectItem value="month">This month</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

interface SortSelectProps {
  onChange: (sort: NoteSearchParams["sort"]) => void;
  value: NoteSearchParams["sort"];
}

const SortSelect = ({ onChange, value }: SortSelectProps) => {
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger className="w-full md:w-40">
        <SelectValue placeholder="Sort by" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="newest">Newest first</SelectItem>
        <SelectItem value="oldest">Oldest first</SelectItem>
        <SelectItem value="updated">Recently updated</SelectItem>
      </SelectContent>
    </Select>
  );
};

// Search input component
interface SearchInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClear: () => void;
  onSearch: (query: string) => void;
  value: string;
}

const SearchInput = ({
  inputRef,
  onClear,
  onSearch,
  value,
}: SearchInputProps) => {
  return (
    <InputGroup className="h-9 flex-1 rounded-lg lg:max-w-xs">
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        onChange={(e) => {
          onSearch(e.target.value);
        }}
        placeholder="Search notes..."
        ref={inputRef}
        spellCheck={false}
        type="search"
        value={value}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={onClear}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Clear search</span>
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
};

// Desktop filters layout
interface DesktopFiltersProps {
  filters: {
    q: string;
    sort: NoteSearchParams["sort"];
    time: NoteSearchParams["time"];
  };
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onClearSearch: () => void;
  onSearch: (query: string) => void;
  onSortChange: (sort: NoteSearchParams["sort"]) => void;
  onTimeChange: (time: NoteSearchParams["time"]) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

const DesktopFilters = ({
  filters,
  hasActiveFilters,
  onClearFilters,
  onClearSearch,
  onSearch,
  onSortChange,
  onTimeChange,
  searchInputRef,
}: DesktopFiltersProps) => {
  return (
    <div className="hidden flex-wrap items-center gap-4 lg:flex">
      <SearchInput
        inputRef={searchInputRef}
        onClear={onClearSearch}
        onSearch={onSearch}
        value={filters.q}
      />
      <TimeSelect onChange={onTimeChange} value={filters.time} />
      <SortSelect onChange={onSortChange} value={filters.sort} />

      {hasActiveFilters && (
        <Button onClick={onClearFilters} size="sm" variant="ghost">
          Clear filters
        </Button>
      )}
    </div>
  );
};

// Mobile filters layout
interface MobileFiltersProps {
  filters: {
    q: string;
    sort: NoteSearchParams["sort"];
    time: NoteSearchParams["time"];
  };
  hasActiveFilters: boolean;
  isOpen: boolean;
  onClearFilters: () => void;
  onClearSearch: () => void;
  onOpenChange: (open: boolean) => void;
  onSearch: (query: string) => void;
  onSortChange: (sort: NoteSearchParams["sort"]) => void;
  onTimeChange: (time: NoteSearchParams["time"]) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

const MobileFilters = ({
  filters,
  hasActiveFilters,
  isOpen,
  onClearFilters,
  onClearSearch,
  onOpenChange,
  onSearch,
  onSortChange,
  onTimeChange,
  searchInputRef,
}: MobileFiltersProps) => {
  return (
    <div className="flex items-center gap-2 lg:hidden">
      <SearchInput
        inputRef={searchInputRef}
        onClear={onClearSearch}
        onSearch={onSearch}
        value={filters.q}
      />
      <Sheet onOpenChange={onOpenChange} open={isOpen}>
        <SheetTrigger asChild>
          <Button className="relative shrink-0" size="sm" variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <div className="bg-primary absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full" />
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="h-[400px]" side="bottom">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              Filter Notes
              {hasActiveFilters && (
                <Button onClick={onClearFilters} size="sm" variant="ghost">
                  Clear all
                </Button>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="text-muted-foreground h-4 w-4" />
                <span>Time Period</span>
              </div>
              <TimeSelect onChange={onTimeChange} value={filters.time} />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Sort By</div>
              <SortSelect onChange={onSortChange} value={filters.sort} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export const NotesFilters = () => {
  const [filters, setFilters] = useQueryStates(parsers, { shallow: false });
  const [isOpen, setIsOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState(filters.q);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const updateTime = async (time: NoteSearchParams["time"]) => {
    await setFilters({ time });
  };

  const updateSort = async (sort: NoteSearchParams["sort"]) => {
    await setFilters({ sort });
  };

  const updateSearch = (query: string) => {
    setLocalQuery(query);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      void setFilters({ q: query });
    }, 300);
  };

  const clearSearch = async () => {
    setLocalQuery("");
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    await setFilters({ q: "" });
    searchInputRef.current?.focus();
  };

  const hasActiveFilters =
    filters.time !== "all" || filters.sort !== "newest" || filters.q !== "";

  const clearFilters = async () => {
    setLocalQuery("");
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    await setFilters({
      q: "",
      sort: "newest",
      time: "all",
    });
    setIsOpen(false);
  };

  return (
    <>
      <DesktopFilters
        filters={{ ...filters, q: localQuery }}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        onClearSearch={clearSearch}
        onSearch={updateSearch}
        onSortChange={updateSort}
        onTimeChange={updateTime}
        searchInputRef={searchInputRef}
      />
      <MobileFilters
        filters={{ ...filters, q: localQuery }}
        hasActiveFilters={hasActiveFilters}
        isOpen={isOpen}
        onClearFilters={clearFilters}
        onClearSearch={clearSearch}
        onOpenChange={setIsOpen}
        onSearch={updateSearch}
        onSortChange={updateSort}
        onTimeChange={updateTime}
        searchInputRef={searchInputRef}
      />
    </>
  );
};
