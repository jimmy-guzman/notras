"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { searchNotes } from "@/actions/search-notes";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../ui/input-group";
import { Kbd } from "../ui/kbd";

export function HomeSearch() {
  const inputRef = useRef<HTMLInputElement>(null);

  useHotkeys("slash", () => inputRef.current?.focus(), {
    preventDefault: true,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <search className="w-full max-w-xl">
      <form action={searchNotes}>
        <label className="sr-only" htmlFor="home-search">
          Search notes
        </label>
        <InputGroup className="h-12 rounded-xl">
          <InputGroupAddon align="inline-start">
            <Kbd>/</Kbd>
          </InputGroupAddon>
          <InputGroupInput
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            id="home-search"
            name="q"
            placeholder="search notes..."
            ref={inputRef}
            spellCheck={false}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="sm" type="submit" variant="default">
              <SearchIcon />
              <span className="sr-only sm:not-sr-only">search</span>
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </search>
  );
}
