"use client";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./ui/input-group";
import { Kbd } from "./ui/kbd";

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

  if (isHome) return null;

  return (
    <search className="flex flex-1 justify-center sm:max-w-md">
      <form className="w-full" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="nav-search">
          Search notes
        </label>
        <InputGroup className="h-8 rounded-lg">
          <InputGroupAddon align="inline-start">
            <Kbd>/</Kbd>
          </InputGroupAddon>
          <InputGroupInput
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            id="nav-search"
            onChange={(e) => {
              setValue(e.target.value);
            }}
            placeholder="search notes..."
            ref={inputRef}
            spellCheck={false}
            value={value}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" type="submit" variant="ghost">
              <SearchIcon />
              <span className="sr-only">search</span>
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </search>
  );
}
