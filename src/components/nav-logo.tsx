"use client";

import { NotebookPenIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const spring = {
  damping: 30,
  stiffness: 300,
  type: "spring",
} as const;

export function NavLogo() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label="home" asChild size="sm" variant="ghost">
          <Link href="/">
            <NotebookPenIcon className="size-5" />
            <AnimatePresence initial={false}>
              {!isHome && (
                <motion.span
                  animate={{ opacity: 1, width: "auto" }}
                  className="hidden items-center gap-1 overflow-hidden sm:inline-flex"
                  exit={{ opacity: 0, width: 0 }}
                  initial={{ opacity: 0, width: 0 }}
                  transition={spring}
                >
                  <span className="text-sm font-semibold tracking-tight">
                    notras
                  </span>
                  <Kbd>h</Kbd>
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent
        className={isHome ? undefined : "sm:hidden"}
        side="bottom"
        sideOffset={4}
      >
        <div className="flex items-center gap-2">
          home <Kbd>h</Kbd>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
