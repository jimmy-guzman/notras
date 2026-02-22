"use client";

import { Calendar, Plus, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import type { NoteSearchParams } from "@/lib/notes-search-params";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
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
  const [localQuery, setLocalQuery] = useState(filters.q);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useHotkeys(
    "slash",
    () => {
      searchInputRef.current?.focus();
    },
    { preventDefault: true },
  );

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

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <InputGroup className="h-9 min-w-0 flex-1 rounded-lg">
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          onChange={(e) => {
            updateSearch(e.target.value);
          }}
          placeholder="Search notes..."
          ref={searchInputRef}
          spellCheck={false}
          type="search"
          value={localQuery}
        />
        {localQuery ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              onClick={clearSearch}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <XIcon className="h-4 w-4" />
              <span className="sr-only">Clear search</span>
            </InputGroupButton>
          </InputGroupAddon>
        ) : (
          <InputGroupAddon align="inline-end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="flex items-center gap-2">
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
            <SelectItem value="updated">Recently updated</SelectItem>
          </SelectContent>
        </Select>

        <Button asChild className="shrink-0" variant="outline">
          <Link href="/notes/new">
            <Plus className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">New Note</span>
            <Kbd className="hidden sm:inline-flex">N</Kbd>
          </Link>
        </Button>
      </div>
    </div>
  );
};
