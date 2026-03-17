"use client";

import { onErrorDeferred, onSuccessDeferred } from "@orpc/react";
import { useServerAction } from "@orpc/react/hooks";
import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { FolderId } from "@/lib/id";

import { deleteFolder } from "@/actions/delete-folder";
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

interface DeleteFolderButtonProps {
  folderId: FolderId;
  folderName: string;
  iconOnly?: boolean;
}

export function DeleteFolderButton({
  folderId,
  folderName,
  iconOnly = false,
}: DeleteFolderButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const action = useServerAction(deleteFolder, {
    interceptors: [
      onSuccessDeferred(() => {
        toast.success("folder deleted");
        router.push("/notes");
      }),
      onErrorDeferred(() => {
        toast.error("failed to delete folder. please try again.");
      }),
    ],
  });

  const handleDelete = () => {
    void action.execute({ folderId });
  };

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Trash2Icon className="h-4 w-4" />
          {iconOnly ? (
            <span className="sr-only">delete</span>
          ) : (
            <span className="sr-only sm:not-sr-only">delete</span>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>delete folder</AlertDialogTitle>
          <AlertDialogDescription>
            delete &ldquo;{folderName}&rdquo;? notes inside will not be deleted
            — they will become unfiled.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={action.isPending}
            onClick={handleDelete}
            variant="destructive"
          >
            {action.isPending ? "deleting..." : "delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
