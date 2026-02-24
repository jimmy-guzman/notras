"use client";

import { NotebookPenIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

export function NavLogo() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return isHome ? null : (
    <Button asChild size="sm" variant="ghost">
      <Link href="/">
        <NotebookPenIcon className="size-5 sm:hidden" />
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">
          notras
        </span>
        <span className="hidden animate-nav-slide-in sm:inline-flex">
          <Kbd>h</Kbd>
        </span>
      </Link>
    </Button>
  );
}
