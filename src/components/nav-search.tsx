"use client";

import { AnimatePresence } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { parsers } from "@/lib/notes-search-params";

import { SearchBar } from "./search-bar";

export function NavSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const isHome = pathname === "/";
  const isNotesPage = pathname === "/notes";

  const [params, setParams] = useQueryStates(
    { q: parsers.q },
    { shallow: false },
  );

  const [draft, setDraft] = useState<null | string>(null);
  const value = draft ?? params.q;

  useHotkeys("slash", () => inputRef.current?.focus(), {
    enabled: !isHome,
    preventDefault: true,
  });

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = value.trim();

    if (isNotesPage) {
      await setParams({ q: trimmed || null });
    } else if (trimmed) {
      router.push(`/notes?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/notes");
    }

    setDraft(null);
    inputRef.current?.blur();
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
                onBlur: () => {
                  setDraft(null);
                },
                onChange: (e) => {
                  setDraft(e.target.value);
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
