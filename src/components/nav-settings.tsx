"use client";

import { Settings } from "lucide-react";
import Link from "next/link";

import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function NavSettings() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label="settings" asChild size="sm" variant="ghost">
          <Link href="/settings">
            <Settings className="size-4" />
            <span className="sr-only sm:not-sr-only">settings</span>
            <Kbd className="hidden sm:inline-flex">s</Kbd>
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="sm:hidden" side="bottom" sideOffset={4}>
        <div className="flex items-center gap-2">
          settings <Kbd>s</Kbd>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
