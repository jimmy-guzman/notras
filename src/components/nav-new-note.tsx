"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

export function NavNewNote() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  if (isHome) {
    return null;
  }

  return (
    <div className="shrink-0 animate-nav-slide-in">
      <Button asChild size="sm" variant="outline">
        <Link href="/notes/new">
          <PlusIcon className="size-4 sm:hidden" />
          <span className="hidden sm:inline">new</span>
          <Kbd className="hidden sm:inline-flex">n</Kbd>
        </Link>
      </Button>
    </div>
  );
}
