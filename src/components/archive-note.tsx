"use client";

import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";

import { archiveNote } from "@/actions/archive-note";

import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

export const ArchiveNote = ({ noteId }: { noteId: string }) => {
  const router = useRouter();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="h-6 w-6"
            onClick={async () => {
              await archiveNote(noteId);

              router.refresh();
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
    </TooltipProvider>
  );
};
