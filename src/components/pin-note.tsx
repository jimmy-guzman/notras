"use client";

import { PinIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { pinNote } from "@/actions/pin-note";
import { unpinNote } from "@/actions/unpin-note";

import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

export const PinNote = ({
  noteId,
  pinned,
}: {
  noteId: string;
  pinned: boolean;
}) => {
  const router = useRouter();

  async function handleTogglePin() {
    await (pinned ? unpinNote(noteId) : pinNote(noteId));

    router.refresh();
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={pinned ? "Unpin" : "Pin"}
            className="h-6 w-6"
            onClick={handleTogglePin}
            size="icon"
            variant="ghost"
          >
            <PinIcon
              className="h-4 w-4"
              fill={pinned ? "currentColor" : "none"}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {pinned ? "Unpin" : "Pin"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
