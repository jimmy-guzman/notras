"use client";

import { Archive } from "lucide-react";
import { toast } from "sonner";

import { archiveNote } from "@/actions/archive-note";
import { unarchiveNote } from "@/actions/unarchive-note";

import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export const ArchiveNote = ({ noteId }: { noteId: string }) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label="Archive"
          onClick={async () => {
            await archiveNote(noteId);

            toast("Note archived", {
              action: {
                label: "Undo",
                onClick: () => {
                  void (async () => {
                    await unarchiveNote(noteId);
                  })();
                },
              },
            });
          }}
          size="icon"
          variant="ghost"
        >
          <Archive className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        Archive
      </TooltipContent>
    </Tooltip>
  );
};
