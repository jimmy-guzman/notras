"use client";

import type { VariantProps } from "class-variance-authority";
import type { MouseEvent } from "react";

import { onErrorDeferred } from "@orpc/react";
import { useOptimisticServerAction } from "@orpc/react/hooks";
import { PinIcon } from "lucide-react";
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
  const pinAction = useOptimisticServerAction(pinNote, {
    interceptors: [
      onErrorDeferred(() => {
        toast.error("failed to pin note. please try again.");
      }),
    ],
    optimisticPassthrough: pinned,
    optimisticReducer: () => true,
  });

  const unpinAction = useOptimisticServerAction(unpinNote, {
    interceptors: [
      onErrorDeferred(() => {
        toast.error("failed to unpin note. please try again.");
      }),
    ],
    optimisticPassthrough: pinned,
    optimisticReducer: () => false,
  });

  const optimisticPinned = pinAction.isPending
    ? pinAction.optimisticState
    : unpinAction.isPending
      ? unpinAction.optimisticState
      : pinned;

  function handleTogglePin(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();

    if (optimisticPinned) {
      void unpinAction.execute({ noteId });
    } else {
      void pinAction.execute({ noteId });
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
