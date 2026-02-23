"use client";

import { NotebookPenIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "./ui/button";

export function NavLogo() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <Button asChild size="icon" variant="ghost">
      <Link className="relative" href="/">
        <NotebookPenIcon className="size-5" />
        <AnimatePresence>
          {!isHome && (
            <motion.span
              animate={{ opacity: 1, x: 0 }}
              className="absolute left-full ml-1 hidden text-sm font-semibold tracking-tight sm:inline"
              exit={{ opacity: 0, x: -4 }}
              initial={{ opacity: 0, x: -4 }}
              transition={{
                damping: 30,
                stiffness: 300,
                type: "spring",
              }}
            >
              notras
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    </Button>
  );
}
