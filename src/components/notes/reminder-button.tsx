"use client";

import { onErrorDeferred, onSuccessDeferred } from "@orpc/react";
import { useServerAction } from "@orpc/react/hooks";
import { BellIcon, BellOffIcon } from "lucide-react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

import type { NoteId } from "@/lib/id";
import type { ReminderPreset } from "@/lib/utils/reminder-presets";

import { clearReminder } from "@/actions/clear-reminder";
import { setReminder } from "@/actions/set-reminder";
import { useReminders } from "@/components/reminders-provider";
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
import { formatDateTime } from "@/lib/utils/format";
import { REMINDER_PRESETS } from "@/lib/utils/reminder-presets";

interface ReminderButtonProps {
  noteId: NoteId;
  remindAt: Date | null;
}

export function ReminderButton({ noteId, remindAt }: ReminderButtonProps) {
  const [open, setOpen] = useState(false);
  const { decrement } = useReminders();
  const hasReminder = remindAt !== null;

  const setReminderAction = useServerAction(setReminder, {
    interceptors: [
      onSuccessDeferred((result) => {
        toast.success(`reminder set for ${formatDateTime(result.remindAt)}`);
      }),
      onErrorDeferred(() => {
        toast.error("failed to set reminder. please try again.");
      }),
    ],
  });

  const clearReminderAction = useServerAction(clearReminder, {
    interceptors: [
      onSuccessDeferred(() => {
        toast.success("reminder cleared");
      }),
      onErrorDeferred(() => {
        toast.error("failed to clear reminder. please try again.");
      }),
    ],
  });

  const isPending =
    setReminderAction.isPending || clearReminderAction.isPending;

  useHotkeys("r", () => {
    setOpen((prev) => !prev);
  });

  function handleSetReminder(preset: ReminderPreset) {
    const isOverdue = remindAt !== null && remindAt <= new Date();

    void setReminderAction.execute(
      { noteId, preset },
      {
        interceptors: [
          onSuccessDeferred(() => {
            if (isOverdue) {
              decrement();
            }
          }),
        ],
      },
    );
  }

  function handleClearReminder() {
    const isOverdue = remindAt !== null && remindAt <= new Date();

    void clearReminderAction.execute(
      { noteId },
      {
        interceptors: [
          onSuccessDeferred(() => {
            if (isOverdue) {
              decrement();
            }
          }),
        ],
      },
    );
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
            <DropdownMenuLabel>{formatDateTime(remindAt)}</DropdownMenuLabel>
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
