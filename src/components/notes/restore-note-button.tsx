"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { unarchiveNote } from "@/actions/unarchive-note";
import { cn } from "@/lib/ui/utils";

import { Button } from "../ui/button";

interface RestoreNoteButtonProps {
  className?: string;
  noteId: string;
}

export const RestoreNoteButton = ({
  className,
  noteId,
}: RestoreNoteButtonProps) => {
  const [isPending, startTransition] = useTransition();

  const handleRestore = () => {
    startTransition(async () => {
      try {
        await unarchiveNote(noteId);

        toast.success("Note restored.", {
          action: (
            <Link
              data-action="true"
              data-button="true"
              href={`/notes/${noteId}`}
            >
              View Note
            </Link>
          ),
        });
      } catch {
        toast.error("Failed to restore note. Please try again.");
      }
    });
  };

  return (
    <Button
      className={cn(className)}
      disabled={isPending}
      onClick={handleRestore}
      size="icon"
      variant="ghost"
    >
      <RotateCcw className="h-3 w-3" />
      <span className="sr-only">Restore note</span>
    </Button>
  );
};
