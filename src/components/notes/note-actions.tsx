"use client";

import { ArrowLeftIcon, PencilIcon, PinIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import type { NoteId } from "@/lib/id";

import { pinNote } from "@/actions/pin-note";
import { unpinNote } from "@/actions/unpin-note";
import { CopyNoteButton } from "@/components/notes/copy-note-button";
import { DeleteNoteButton } from "@/components/notes/delete-note-button";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NoteActionsProps {
  content: string;
  noteId: NoteId;
  pinned: boolean;
}

export function NoteActions({ content, noteId, pinned }: NoteActionsProps) {
  const router = useRouter();

  const handleTogglePin = useCallback(async () => {
    await (pinned ? unpinNote(noteId) : pinNote(noteId));
  }, [noteId, pinned]);

  useHotkeys("e", () => {
    router.push(`/notes/${noteId}/edit`);
  });

  useHotkeys("p", () => {
    void handleTogglePin();
  });

  return (
    <div className="flex items-center justify-between">
      <Button asChild size="sm" variant="ghost">
        <Link href="/notes">
          <ArrowLeftIcon className="h-4 w-4" /> Notes
        </Link>
      </Button>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={pinned ? "Unpin" : "Pin"}
              onClick={handleTogglePin}
              size="sm"
              variant="ghost"
            >
              <PinIcon fill={pinned ? "currentColor" : "none"} />
              <span className="sr-only sm:not-sr-only">
                {pinned ? "Unpin" : "Pin"}
              </span>
              <Kbd className="hidden sm:inline-flex">P</Kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden" side="top" sideOffset={4}>
            <div className="flex items-center gap-2">
              {pinned ? "Unpin" : "Pin"} <Kbd>P</Kbd>
            </div>
          </TooltipContent>
        </Tooltip>

        <DeleteNoteButton noteId={noteId} />

        <CopyNoteButton content={content} />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Edit Note" asChild size="sm" variant="ghost">
              <Link href={`/notes/${noteId}/edit`}>
                <PencilIcon className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only">Edit</span>
                <Kbd className="hidden sm:inline-flex">E</Kbd>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden" side="top" sideOffset={4}>
            <div className="flex items-center gap-2">
              Edit <Kbd>E</Kbd>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
