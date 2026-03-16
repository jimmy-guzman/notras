"use client";

import { ArrowUpDownIcon, CalendarIcon } from "lucide-react";
import { useQueryStates } from "nuqs";

import type { NoteSearchParams } from "@/lib/notes-search-params";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parsers } from "@/lib/notes-search-params";

export const NotesFilters = () => {
  const [filters, setFilters] = useQueryStates(parsers, { shallow: false });

  const updateTime = async (time: NoteSearchParams["time"]) => {
    await setFilters({ time });
  };

  const updateSort = async (sort: NoteSearchParams["sort"]) => {
    await setFilters({ sort });
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <CalendarIcon className="hidden h-4 w-4 text-muted-foreground sm:block" />
        <Select onValueChange={updateTime} value={filters.time}>
          <SelectTrigger aria-label="time range" className="w-28 sm:w-32">
            <SelectValue placeholder="all time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all time</SelectItem>
            <SelectItem value="today">today</SelectItem>
            <SelectItem value="yesterday">yesterday</SelectItem>
            <SelectItem value="week">this week</SelectItem>
            <SelectItem value="month">this month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <ArrowUpDownIcon className="hidden h-4 w-4 text-muted-foreground sm:block" />
        <Select onValueChange={updateSort} value={filters.sort}>
          <SelectTrigger aria-label="sort order" className="w-28 sm:w-36">
            <SelectValue placeholder="sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">newest first</SelectItem>
            <SelectItem value="oldest">oldest first</SelectItem>
            <SelectItem value="updated">updated first</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
