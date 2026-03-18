"use client";

import type { VariantProps } from "class-variance-authority";
import type { MouseEvent } from "react";

import { PinIcon } from "lucide-react";
import { useOptimisticAction } from "next-safe-action/hooks";
import { toast } from "sonner";

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
  const pinAction = useOptimisticAction(pinNote, {
    currentState: { pinned },
    onError: () => {
      toast.error("failed to pin note. please try again.");
    },
    updateFn: () => ({ pinned: true }),
  });

  const unpinAction = useOptimisticAction(unpinNote, {
    currentState: { pinned },
    onError: () => {
      toast.error("failed to unpin note. please try again.");
    },
    updateFn: () => ({ pinned: false }),
  });

  const optimisticPinned = pinAction.isPending
    ? pinAction.optimisticState.pinned
    : unpinAction.isPending
      ? unpinAction.optimisticState.pinned
      : pinned;

  function handleTogglePin(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();

    if (pinAction.isPending || unpinAction.isPending) return;

    if (optimisticPinned) {
      unpinAction.execute({ noteId });
    } else {
      pinAction.execute({ noteId });
    }
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
