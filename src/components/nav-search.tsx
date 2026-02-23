"use client";

import { AnimatePresence } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { SearchBar } from "./search-bar";

export function NavSearch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const isHome = pathname === "/";

  const urlQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);

  useEffect(() => {
    setValue(urlQuery);
  }, [urlQuery]);

  useHotkeys("slash", () => inputRef.current?.focus(), {
    enabled: !isHome,
    preventDefault: true,
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = value.trim();

    if (trimmed) {
      router.push(`/notes?q=${encodeURIComponent(trimmed)}`);
      inputRef.current?.blur();
    } else {
      router.push("/notes");
      inputRef.current?.blur();
    }
  };

  return (
    <AnimatePresence initial={false}>
      {!isHome && (
        <search className="flex flex-1 justify-center sm:max-w-md">
          <form className="w-full" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="nav-search">
              search notes
            </label>
            <SearchBar
              id="nav-search"
              inputProps={{
                name: "q",
                onChange: (e) => {
                  setValue(e.target.value);
                },
                value,
              }}
              ref={inputRef}
              variant="nav"
            />
          </form>
        </search>
      )}
    </AnimatePresence>
  );
}
