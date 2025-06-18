"use client";

import { Archive, ArchiveX } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { archiveNote } from "@/actions/archive-note";
import { unarchiveNote } from "@/actions/unarchive-note";

import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface ArchiveNoteProps {
  isArchived: boolean;
  noteId: string;
}

export const ArchiveNote = ({ isArchived, noteId }: ArchiveNoteProps) => {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      try {
        if (isArchived) {
          await unarchiveNote(noteId);
        } else {
          await archiveNote(noteId);

          toast("Note archived", {
            action: {
              label: "Undo",
              onClick: () => void unarchiveNote(noteId),
            },
          });
        }
      } catch {
        toast.error(`Failed to ${isArchived ? "unarchive" : "archive"} note`);
      }
    });
  };

  const Icon = isArchived ? ArchiveX : Archive;
  const label = isArchived ? "Unarchive" : "Archive";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          disabled={isPending}
          onClick={handleClick}
          size="icon"
          variant="ghost"
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
};
