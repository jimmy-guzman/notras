"use client";

import { format } from "date-fns";
import { BellIcon, BellOffIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

import type { NoteId } from "@/lib/id";
import type { ReminderPreset } from "@/lib/utils/reminder-presets";

import { clearReminder } from "@/actions/clear-reminder";
import { setReminder } from "@/actions/set-reminder";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { REMINDER_PRESETS } from "@/lib/utils/reminder-presets";

interface ReminderButtonProps {
  noteId: NoteId;
  remindAt: Date | null;
}

export function ReminderButton({ noteId, remindAt }: ReminderButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const hasReminder = remindAt !== null;

  useHotkeys("r", () => {
    setOpen((prev) => !prev);
  });

  function handleSetReminder(preset: ReminderPreset) {
    const formData = new FormData();

    formData.set("noteId", noteId);
    formData.set("preset", preset);

    startTransition(async () => {
      const result = await setReminder(formData);

      toast.success(
        `reminder set for ${format(result.remindAt, "MMM d, h:mm a").toLowerCase()}`,
      );
    });
  }

  function handleClearReminder() {
    startTransition(async () => {
      await clearReminder(noteId);

      toast.success("reminder cleared");
    });
  }

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={hasReminder ? "manage reminder" : "set reminder"}
              disabled={isPending}
              size="sm"
              variant="ghost"
            >
              <BellIcon
                className="h-4 w-4"
                fill={hasReminder ? "currentColor" : "none"}
              />
              <span className="sr-only sm:not-sr-only">
                {hasReminder ? "reminder" : "remind"}
              </span>
              <Kbd className="hidden sm:inline-flex">r</Kbd>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent className="sm:hidden" side="top" sideOffset={4}>
          <div className="flex items-center gap-2">
            {hasReminder ? "reminder" : "remind"} <Kbd>r</Kbd>
          </div>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {hasReminder && (
          <>
            <DropdownMenuLabel>
              {format(remindAt, "MMM d, h:mm a").toLowerCase()}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleClearReminder}>
              <BellOffIcon />
              clear reminder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {REMINDER_PRESETS.map((preset) => {
          return (
            <DropdownMenuItem
              key={preset.key}
              onClick={() => {
                handleSetReminder(preset.key);
              }}
            >
              {preset.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
