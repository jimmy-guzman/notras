"use client";

import { Calendar } from "lucide-react";
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
    <div className="flex w-full flex-row gap-2 sm:items-center">
      <div className="flex flex-1 items-center gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select onValueChange={updateTime} value={filters.time}>
            <SelectTrigger className="w-32">
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

        <Select onValueChange={updateSort} value={filters.sort}>
          <SelectTrigger className="w-36">
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
