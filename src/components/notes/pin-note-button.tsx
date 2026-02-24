"use client";

import type { VariantProps } from "class-variance-authority";
import type { MouseEvent } from "react";

import { PinIcon } from "lucide-react";
import { useOptimistic, useTransition } from "react";

import type { NoteId } from "@/lib/id";

import { pinNote } from "@/actions/pin-note";
import { unpinNote } from "@/actions/unpin-note";

import type { buttonVariants } from "../ui/button";

import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface PinNoteButtonProps {
  className?: string;
  noteId: NoteId;
  pinned: boolean;
  size?: VariantProps<typeof buttonVariants>["size"];
}

export const PinNoteButton = ({
  className,
  noteId,
  pinned,
  size = "icon",
}: PinNoteButtonProps) => {
  const [optimisticPinned, setOptimisticPinned] = useOptimistic(pinned);
  const [, startTransition] = useTransition();

  function handleTogglePin(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();

    startTransition(async () => {
      setOptimisticPinned(!optimisticPinned);
      await (optimisticPinned ? unpinNote(noteId) : pinNote(noteId));
    });
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={optimisticPinned ? "unpin" : "pin"}
          className={className}
          onClick={handleTogglePin}
          size={size}
          variant="ghost"
        >
          <PinIcon fill={optimisticPinned ? "currentColor" : "none"} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {optimisticPinned ? "unpin" : "pin"}
      </TooltipContent>
    </Tooltip>
  );
};
