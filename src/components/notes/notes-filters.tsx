"use client";

import { Calendar, Plus } from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";

import type { NoteSearchParams } from "@/lib/notes-search-params";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
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
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="updated">Updated first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button asChild className="shrink-0" variant="outline">
        <Link href="/notes/new">
          <Plus className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">New Note</span>
          <Kbd className="hidden sm:inline-flex">N</Kbd>
        </Link>
      </Button>
    </div>
  );
};
