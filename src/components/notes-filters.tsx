"use client";

import { Calendar, Tag } from "lucide-react";
import { useQueryStates } from "nuqs";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KIND_LABELS, KIND_VALUES } from "@/lib/kind";
import { parsers } from "@/lib/notes-search-params";

export const NotesFilters = () => {
  const [filters, setFilters] = useQueryStates(parsers);

  const updateKind = async (kind: string) => {
    await setFilters({ kind });
  };

  const updateTime = async (time: string) => {
    await setFilters({ time });
  };

  const updateSort = async (sort: string) => {
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
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <Tag className="text-muted-foreground h-4 w-4" />
        <Select onValueChange={updateKind} value={filters.kind}>
          <SelectTrigger className="w-40">
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

      <div className="flex items-center gap-2">
        <Calendar className="text-muted-foreground h-4 w-4" />
        <Select onValueChange={updateTime} value={filters.time}>
          <SelectTrigger className="w-40">
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

      <Select onValueChange={updateSort} value={filters.sort}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
          <SelectItem value="oldest">Oldest first</SelectItem>
          <SelectItem value="updated">Recently updated</SelectItem>
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button onClick={clearFilters} size="sm" variant="ghost">
          Clear filters
        </Button>
      )}
    </div>
  );
};
