"use client";

import { NotebookPenIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function NavLogo() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label="home" asChild size="sm" variant="ghost">
          <Link href="/">
            <NotebookPenIcon className="size-5" />
            {!isHome && (
              <span className="hidden animate-nav-slide-in items-center gap-1 sm:inline-flex">
                <span className="text-sm font-semibold tracking-tight">
                  notras
                </span>
                <Kbd>h</Kbd>
              </span>
            )}
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
