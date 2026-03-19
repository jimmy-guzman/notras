"use client";

import { AnimatePresence } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDebouncedCallback } from "use-debounce";

import { parsers } from "@/lib/notes-search-params";

import { SearchBar } from "./search-bar";

interface NavSearchProps {
  layoutId?: string;
}

function isSearchRegionVisible(el: HTMLElement) {
  return el.offsetParent !== null;
}

export function NavSearch({ layoutId }: NavSearchProps) {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRegionRef = useRef<HTMLElement>(null);
  const prevPathnameRef = useRef<null | string>(null);
  const prevQRef = useRef("");
  const isHome = pathname === "/";
  const isNotesPage = pathname === "/notes";

  const [params, setParams] = useQueryStates(
    { q: parsers.q },
    { shallow: false },
  );

  const [draft, setDraft] = useState<null | string>(null);
  const value = draft ?? params.q;

  const debounced = useDebouncedCallback(async (q: string) => {
    const trimmed = q.trim();

    if (isNotesPage) {
      await setParams({ q: trimmed || null });
    } else if (trimmed) {
      router.push(`/notes?q=${encodeURIComponent(trimmed)}`);
    }
  }, 300);

  useEffect(() => {
    const prevPath = prevPathnameRef.current;
    const prevQ = prevQRef.current;
    const q = params.q.trim();
    const region = searchRegionRef.current;

    if (pathname === "/notes" && q && region && isSearchRegionVisible(region)) {
      const shouldFocus =
        prevPath === null || prevPath !== "/notes" || prevQ === "";

      if (shouldFocus) {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }

    prevPathnameRef.current = pathname;
    prevQRef.current = q;
  }, [params.q, pathname]);

  useHotkeys("slash", () => inputRef.current?.focus(), {
    enabled: !isHome,
    preventDefault: true,
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    void debounced.flush();
    setDraft(null);
  };

  return (
    <AnimatePresence initial={false}>
      {!isHome && (
        <search
          className="flex flex-1 justify-center sm:max-w-md"
          ref={searchRegionRef}
        >
          <form className="w-full" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="nav-search">
              search notes
            </label>
            <SearchBar
              id="nav-search"
              inputProps={{
                name: "q",
                onBlur: () => {
                  debounced.cancel();
                  setDraft(null);
                },
                onChange: (e) => {
                  setDraft(e.target.value);
                  void debounced(e.target.value);
                },
                value,
              }}
              layoutId={layoutId}
              ref={inputRef}
              variant="nav"
            />
          </form>
        </search>
      )}
    </AnimatePresence>
  );
}
