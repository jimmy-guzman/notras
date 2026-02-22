"use client";

import type { SpringOptions } from "motion/react";

import { SearchIcon } from "lucide-react";
import { motion } from "motion/react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/ui/utils";

const SEARCH_LAYOUT_ID = "search-bar";

const springTransition = {
  damping: 30,
  stiffness: 300,
  type: "spring",
} satisfies SpringOptions & { type: "spring" };

type SearchBarVariant = "home" | "nav";

const variantStyles = {
  home: {
    borderRadius: 12,
    className: "h-12",
  },
  nav: {
    borderRadius: 8,
    className: "h-8",
  },
} satisfies Record<
  SearchBarVariant,
  { borderRadius: number; className: string }
>;

interface SearchBarProps {
  id: string;
  inputProps?: Omit<
    React.ComponentProps<typeof InputGroupInput>,
    | "autoCapitalize"
    | "autoComplete"
    | "autoCorrect"
    | "id"
    | "placeholder"
    | "spellCheck"
  >;
  ref?: React.Ref<HTMLInputElement>;
  variant: SearchBarVariant;
}

export function SearchBar({ id, inputProps, ref, variant }: SearchBarProps) {
  const styles = variantStyles[variant];
  const isHome = variant === "home";

  return (
    <motion.div
      layout
      layoutId={SEARCH_LAYOUT_ID}
      style={{ borderRadius: styles.borderRadius }}
      transition={springTransition}
    >
      <InputGroup className={cn("rounded-[inherit]", styles.className)}>
        <InputGroupAddon align="inline-start">
          <Kbd>/</Kbd>
        </InputGroupAddon>
        <InputGroupInput
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          id={id}
          placeholder="search notes..."
          ref={ref}
          spellCheck={false}
          {...inputProps}
        />
        <InputGroupAddon align="inline-end">
          {isHome ? (
            <InputGroupButton size="sm" type="submit" variant="outline">
              <SearchIcon />
              <span className="sr-only sm:not-sr-only">search</span>
            </InputGroupButton>
          ) : (
            <InputGroupButton size="icon-xs" type="submit" variant="ghost">
              <SearchIcon />
              <span className="sr-only">search</span>
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </motion.div>
  );
}
