"use client";

import { Calendar, Filter, Tag } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useState } from "react";

import type { NoteSearchParams } from "@/lib/notes-search-params";

import { Button } from "@/components/ui/button";
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
import { KIND_LABELS, KIND_VALUES } from "@/lib/kind";
import { parsers } from "@/lib/notes-search-params";

// Shared filter controls
interface KindSelectProps {
  onChange: (kind: NoteSearchParams["kind"]) => void;
  value: NoteSearchParams["kind"];
}

const KindSelect = ({ onChange, value }: KindSelectProps) => {
  return (
    <div className="flex items-center gap-2">
      <Tag className="text-muted-foreground h-4 w-4" />
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full md:w-40">
          <SelectValue placeholder="All kinds" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All kinds</SelectItem>
          {KIND_VALUES.map((kind) => {
            return (
              <SelectItem key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};

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

// Desktop filters layout
interface DesktopFiltersProps {
  filters: {
    kind: NoteSearchParams["kind"];
    sort: NoteSearchParams["sort"];
    time: NoteSearchParams["time"];
  };
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onKindChange: (kind: NoteSearchParams["kind"]) => void;
  onSortChange: (sort: NoteSearchParams["sort"]) => void;
  onTimeChange: (time: NoteSearchParams["time"]) => void;
}

const DesktopFilters = ({
  filters,
  hasActiveFilters,
  onClearFilters,
  onKindChange,
  onSortChange,
  onTimeChange,
}: DesktopFiltersProps) => {
  return (
    <div className="hidden flex-wrap items-center gap-4 lg:flex">
      <KindSelect onChange={onKindChange} value={filters.kind} />
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
    kind: NoteSearchParams["kind"];
    sort: NoteSearchParams["sort"];
    time: NoteSearchParams["time"];
  };
  hasActiveFilters: boolean;
  isOpen: boolean;
  onClearFilters: () => void;
  onKindChange: (kind: NoteSearchParams["kind"]) => void;
  onOpenChange: (open: boolean) => void;
  onSortChange: (sort: NoteSearchParams["sort"]) => void;
  onTimeChange: (time: NoteSearchParams["time"]) => void;
}

const MobileFilters = ({
  filters,
  hasActiveFilters,
  isOpen,
  onClearFilters,
  onKindChange,
  onOpenChange,
  onSortChange,
  onTimeChange,
}: MobileFiltersProps) => {
  return (
    <div className="lg:hidden">
      <Sheet onOpenChange={onOpenChange} open={isOpen}>
        <SheetTrigger asChild>
          <Button className="relative" size="sm" variant="outline">
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
                <Tag className="text-muted-foreground h-4 w-4" />
                <span>Kind</span>
              </div>
              <KindSelect onChange={onKindChange} value={filters.kind} />
            </div>

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

  const updateKind = async (kind: NoteSearchParams["kind"]) => {
    await setFilters({ kind });
  };

  const updateTime = async (time: NoteSearchParams["time"]) => {
    await setFilters({ time });
  };

  const updateSort = async (sort: NoteSearchParams["sort"]) => {
    await setFilters({ sort });
  };

  const hasActiveFilters =
    filters.kind !== "all" ||
    filters.time !== "all" ||
    filters.sort !== "newest";

  const clearFilters = async () => {
    await setFilters({
      kind: "all",
      sort: "newest",
      time: "all",
    });
    setIsOpen(false);
  };

  return (
    <>
      <DesktopFilters
        filters={filters}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        onKindChange={updateKind}
        onSortChange={updateSort}
        onTimeChange={updateTime}
      />
      <MobileFilters
        filters={filters}
        hasActiveFilters={hasActiveFilters}
        isOpen={isOpen}
        onClearFilters={clearFilters}
        onKindChange={updateKind}
        onOpenChange={setIsOpen}
        onSortChange={updateSort}
        onTimeChange={updateTime}
      />
    </>
  );
};
