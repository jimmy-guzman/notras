"use client";

import { BellIcon } from "lucide-react";
import Link from "next/link";

import { useReminders } from "./reminders-provider";
import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

export function NavReminders() {
  const { overdueCount } = useReminders();
  const hasOverdue = overdueCount > 0;

  return (
    <Button asChild size="sm" variant={hasOverdue ? "destructive" : "ghost"}>
      <Link href="/reminders">
        <BellIcon className="size-4 sm:hidden" />
        <span className="hidden sm:inline">reminders</span>
        <Kbd className="hidden sm:inline-flex">,</Kbd>
      </Link>
    </Button>
  );
}
