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
          <ArrowLeftIcon className="h-4 w-4" /> notes
        </Link>
      </Button>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={pinned ? "unpin" : "pin"}
              onClick={handleTogglePin}
              size="sm"
              variant="ghost"
            >
              <PinIcon fill={pinned ? "currentColor" : "none"} />
              <span className="sr-only sm:not-sr-only">
                {pinned ? "unpin" : "pin"}
              </span>
              <Kbd className="hidden sm:inline-flex">p</Kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden" side="top" sideOffset={4}>
            <div className="flex items-center gap-2">
              {pinned ? "unpin" : "pin"} <Kbd>p</Kbd>
            </div>
          </TooltipContent>
        </Tooltip>

        <DeleteNoteButton noteId={noteId} />

        <CopyNoteButton content={content} />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="edit note" asChild size="sm" variant="ghost">
              <Link href={`/notes/${noteId}/edit`}>
                <PencilIcon className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only">edit</span>
                <Kbd className="hidden sm:inline-flex">e</Kbd>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden" side="top" sideOffset={4}>
            <div className="flex items-center gap-2">
              edit <Kbd>e</Kbd>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
