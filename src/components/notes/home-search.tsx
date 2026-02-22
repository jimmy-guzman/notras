"use client";

import { useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { searchNotes } from "@/actions/search-notes";

import { SearchBar } from "../search-bar";

export function HomeSearch() {
  const inputRef = useRef<HTMLInputElement>(null);

  useHotkeys("slash", () => inputRef.current?.focus(), {
    preventDefault: true,
  });

  return (
    <search className="w-full max-w-xl">
      <form action={searchNotes}>
        <label className="sr-only" htmlFor="home-search">
          Search notes
        </label>
        <SearchBar
          id="home-search"
          inputProps={{ name: "q" }}
          ref={inputRef}
          variant="home"
        />
      </form>
    </search>
  );
}
