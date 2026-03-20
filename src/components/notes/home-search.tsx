"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDebouncedCallback } from "use-debounce";

import { SearchBar } from "../search-bar";

export function HomeSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  const debounced = useDebouncedCallback((q: string) => {
    const trimmed = q.trim();

    if (trimmed) {
      router.push(`/notes?q=${encodeURIComponent(trimmed)}`);
    }
  }, 300);

  useHotkeys("slash", () => inputRef.current?.focus(), {
    preventDefault: true,
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    debounced.flush();
  };

  return (
    <search className="w-full max-w-xl">
      <form onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="home-search">
          search notes
        </label>
        <SearchBar
          id="home-search"
          inputProps={{
            name: "q",
            onChange: (e) => {
              setValue(e.target.value);
              debounced(e.target.value);
            },
            value,
          }}
          layoutId="search-bar"
          ref={inputRef}
          variant="home"
        />
      </form>
    </search>
  );
}
