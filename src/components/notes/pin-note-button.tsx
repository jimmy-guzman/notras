"use client";

import type { MouseEvent } from "react";

import { PinIcon } from "lucide-react";

import type { NoteId } from "@/lib/id";

import { pinNote } from "@/actions/pin-note";
import { unpinNote } from "@/actions/unpin-note";

import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface PinNoteButtonProps {
  className?: string;
  noteId: NoteId;
  pinned: boolean;
}

export const PinNoteButton = ({
  className,
  noteId,
  pinned,
}: PinNoteButtonProps) => {
  async function handleTogglePin(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();

    await (pinned ? unpinNote(noteId) : pinNote(noteId));
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={pinned ? "unpin" : "pin"}
          className={className}
          onClick={handleTogglePin}
          size="icon"
          variant="ghost"
        >
          <PinIcon fill={pinned ? "currentColor" : "none"} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {pinned ? "unpin" : "pin"}
      </TooltipContent>
    </Tooltip>
  );
};
