"use client";

import type { MouseEvent } from "react";

import { PinIcon } from "lucide-react";

import { pinNote } from "@/actions/pin-note";
import { unpinNote } from "@/actions/unpin-note";

import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface PinNoteProps {
  className?: string;
  noteId: string;
  pinned: boolean;
}

export const PinNote = ({ className, noteId, pinned }: PinNoteProps) => {
  async function handleTogglePin(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();

    await (pinned ? unpinNote(noteId) : pinNote(noteId));
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={pinned ? "Unpin" : "Pin"}
          className={className}
          onClick={handleTogglePin}
          size="icon"
          variant="ghost"
        >
          <PinIcon fill={pinned ? "currentColor" : "none"} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {pinned ? "Unpin" : "Pin"}
      </TooltipContent>
    </Tooltip>
  );
};
