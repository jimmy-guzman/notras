"use client";

import { PencilIcon, PinIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useOptimistic, useTransition } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import type { NoteId } from "@/lib/id";

import { pinNote } from "@/actions/pin-note";
import { unpinNote } from "@/actions/unpin-note";
import { BackLink } from "@/components/back-link";
import { CopyNoteButton } from "@/components/notes/copy-note-button";
import { DeleteNoteButton } from "@/components/notes/delete-note-button";
import { ReminderButton } from "@/components/notes/reminder-button";
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
  remindAt: Date | null;
}

export function NoteActions({
  content,
  noteId,
  pinned,
  remindAt,
}: NoteActionsProps) {
  const router = useRouter();
  const [optimisticPinned, setOptimisticPinned] = useOptimistic(pinned);
  const [, startTransition] = useTransition();

  const handleTogglePin = useCallback(() => {
    startTransition(async () => {
      setOptimisticPinned(!optimisticPinned);
      await (optimisticPinned ? unpinNote(noteId) : pinNote(noteId));
    });
  }, [noteId, optimisticPinned, setOptimisticPinned, startTransition]);

  useHotkeys("e", () => {
    router.push(`/notes/${noteId}/edit`);
  });

  useHotkeys("p", () => {
    handleTogglePin();
  });

  return (
    <div className="flex items-center justify-between">
      <BackLink href="/notes" label="notes" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={optimisticPinned ? "unpin" : "pin"}
              onClick={handleTogglePin}
              size="sm"
              variant="ghost"
            >
              <PinIcon fill={optimisticPinned ? "currentColor" : "none"} />
              <span className="sr-only sm:not-sr-only">
                {optimisticPinned ? "unpin" : "pin"}
              </span>
              <Kbd className="hidden sm:inline-flex">p</Kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden" side="top" sideOffset={4}>
            <div className="flex items-center gap-2">
              {optimisticPinned ? "unpin" : "pin"} <Kbd>p</Kbd>
            </div>
          </TooltipContent>
        </Tooltip>

        <ReminderButton noteId={noteId} remindAt={remindAt} />

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
