"use client";

import { SettingsIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

export function NavSettings() {
  return (
    <Button asChild size="sm" variant="ghost">
      <Link href="/settings">
        <SettingsIcon className="size-4 sm:hidden" />
        <span className="hidden sm:inline">settings</span>
        <Kbd className="hidden sm:inline-flex">s</Kbd>
      </Link>
    </Button>
  );
}
