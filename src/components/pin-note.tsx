"use client";

import { PinIcon } from "lucide-react";

import { pinNote } from "@/actions/pin-note";
import { unpinNote } from "@/actions/unpin-note";

import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export const PinNote = ({
  noteId,
  pinned,
}: {
  noteId: string;
  pinned: boolean;
}) => {
  async function handleTogglePin() {
    await (pinned ? unpinNote(noteId) : pinNote(noteId));
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={pinned ? "Unpin" : "Pin"}
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
