"use client";

import type { Transition } from "motion/react";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { SearchBar } from "../search-bar";

const entranceTransition = {
  duration: 0.5,
  ease: [0.22, 1, 0.36, 1],
  type: "tween",
} satisfies Transition;

export function HomeSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useHotkeys("slash", () => inputRef.current?.focus(), {
    preventDefault: true,
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = value.trim();

    if (trimmed) {
      router.push(`/notes?q=${encodeURIComponent(trimmed)}`);
      inputRef.current?.blur();
    }
  };

  return (
    <motion.search
      animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
      className="w-full max-w-xl"
      initial={{ filter: "blur(4px)", opacity: 0, y: 16 }}
      transition={entranceTransition}
    >
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
            },
            value,
          }}
          ref={inputRef}
          variant="home"
        />
      </form>
    </motion.search>
  );
}
