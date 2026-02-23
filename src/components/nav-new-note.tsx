"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function NavNewNote() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  if (isHome) {
    return null;
  }

  return (
    <div className="shrink-0 animate-nav-slide-in">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button aria-label="new note" asChild size="sm" variant="outline">
            <Link href="/notes/new">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">new note</span>
              <Kbd className="hidden sm:inline-flex">n</Kbd>
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="sm:hidden" side="bottom" sideOffset={4}>
          <div className="flex items-center gap-2">
            new note <Kbd>n</Kbd>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
