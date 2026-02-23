"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import type { NoteId } from "@/lib/id";

import { deleteNote } from "@/actions/delete-note";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DeleteNoteButtonProps {
  noteId: NoteId;
}

export function DeleteNoteButton({ noteId }: DeleteNoteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteNote(noteId);
        router.push("/notes");
      } catch {
        toast.error("failed to delete note. please try again.");
      }
    });
  };

  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              aria-label="delete"
              disabled={isPending}
              size="sm"
              variant="ghost"
            >
              <Trash2Icon className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">delete</span>
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent className="sm:hidden" side="top" sideOffset={4}>
          delete
        </TooltipContent>
      </Tooltip>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>delete note</AlertDialogTitle>
          <AlertDialogDescription>
            this action cannot be undone. this note will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={handleDelete}
            variant="destructive"
          >
            {isPending ? "deleting..." : "delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
