"use client";

import {
  useDragDropMonitor,
  useDragOperation,
  useDroppable,
} from "@dnd-kit/react";
import { onErrorDeferred, onSuccessDeferred } from "@orpc/react";
import { useServerAction } from "@orpc/react/hooks";
import { FolderMinusIcon, Trash2Icon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import type { NoteId } from "@/lib/id";
import type { FolderWithCount } from "@/server/repositories/folder-repository";

import { deleteNote } from "@/actions/delete-note";
import { moveNoteToFolder } from "@/actions/move-note-to-folder";
import { CreateFolderButton } from "@/components/folders/create-folder-button";
import { DeleteFolderButton } from "@/components/folders/delete-folder-button";
import { RenameFolderButton } from "@/components/folders/rename-folder-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toFolderId, toNoteId } from "@/lib/id";
import { parsers } from "@/lib/notes-search-params";
import { cn } from "@/lib/ui/utils";

const UNFILED_ID = "__unfiled__";
const TRASH_ID = "__trash__";

function TrashChip() {
  const { isDropTarget, ref } = useDroppable({ id: TRASH_ID });

  return (
    <div
      className={cn(
        "flex items-center rounded-full border p-1.5 transition-all",
        isDropTarget
          ? "scale-105 border-destructive bg-destructive/10 shadow-md"
          : "border-border bg-background",
      )}
      ref={ref}
    >
      <Trash2Icon className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}

function UnfiledChip() {
  const { isDropTarget, ref } = useDroppable({ id: UNFILED_ID });

  return (
    <div
      className={cn(
        "flex items-center rounded-full border p-1.5 transition-all",
        isDropTarget
          ? "scale-105 border-primary bg-primary/10 shadow-md"
          : "border-border bg-background",
      )}
      ref={ref}
    >
      <FolderMinusIcon className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}

interface DropChipProps {
  activeFolder: string;
  folder: FolderWithCount;
  isDragging: boolean;
}

function DropChip({ activeFolder, folder, isDragging }: DropChipProps) {
  const folderId = toFolderId(folder.id);
  const { isDropTarget, ref } = useDroppable({ id: folder.id });
  const [, setFilters] = useQueryStates(parsers, { shallow: false });
  const isActive = activeFolder === folder.id;

  const handleClick = async () => {
    await setFilters({ folder: isActive ? "" : folder.id });
  };

  return (
    <div
      className={cn(
        "group relative flex items-center rounded-full border px-3 py-1.5 transition-all",
        isDragging
          ? isDropTarget
            ? "scale-105 border-primary bg-primary/10 shadow-md"
            : "border-border bg-background hover:border-primary/50"
          : isActive
            ? "border-primary bg-primary/10"
            : "border-border bg-background hover:border-primary/50",
      )}
      ref={ref}
    >
      <Button
        className="h-auto p-0 text-sm font-medium"
        onClick={handleClick}
        type="button"
        variant="ghost"
      >
        {folder.name}
        {!isDragging && (
          <span className="ml-1.5 text-xs text-muted-foreground">
            {folder.noteCount}
          </span>
        )}
      </Button>
      {!isDragging && (
        <div className="ml-1 flex max-w-0 items-center gap-0.5 overflow-hidden opacity-0 transition-[max-width,opacity] duration-150 group-focus-within:max-w-20 group-focus-within:opacity-100 group-hover:max-w-20 group-hover:opacity-100">
          <RenameFolderButton
            currentName={folder.name}
            folderId={folderId}
            iconOnly
          />
          <DeleteFolderButton
            folderId={folderId}
            folderName={folder.name}
            iconOnly
          />
        </div>
      )}
    </div>
  );
}

interface AllChipProps {
  activeFolder: string;
}

function AllChip({ activeFolder }: AllChipProps) {
  const [, setFilters] = useQueryStates(parsers, { shallow: false });
  const isActive = !activeFolder;

  const handleClick = async () => {
    await setFilters({ folder: "" });
  };

  return (
    <Button
      className={cn(
        "h-auto rounded-full px-3 py-1.5 text-sm font-medium",
        isActive
          ? "border-primary bg-primary/10 hover:bg-primary/10"
          : "hover:border-primary/50",
      )}
      onClick={handleClick}
      type="button"
      variant="outline"
    >
      all
    </Button>
  );
}

interface NoteDropPanelProps {
  folders: FolderWithCount[];
}

export function NoteDropPanel({ folders }: NoteDropPanelProps) {
  const [filters] = useQueryStates(parsers);
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<NoteId | null>(
    null,
  );
  const { source } = useDragOperation();
  const isDragging = Boolean(source);

  const moveAction = useServerAction(moveNoteToFolder, {
    interceptors: [
      onSuccessDeferred(() => {
        toast.success("note moved to folder");
      }),
      onErrorDeferred(() => {
        toast.error("failed to move note. please try again.");
      }),
    ],
  });

  const removeAction = useServerAction(moveNoteToFolder, {
    interceptors: [
      onSuccessDeferred(() => {
        toast.success("note removed from folder");
      }),
      onErrorDeferred(() => {
        toast.error("failed to remove note from folder. please try again.");
      }),
    ],
  });

  const deleteAction = useServerAction(deleteNote, {
    interceptors: [
      onSuccessDeferred(() => {
        setPendingDeleteNoteId(null);
      }),
      onErrorDeferred(() => {
        toast.error("failed to delete note. please try again.");
      }),
    ],
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR portal guard
    setMounted(true);
  }, []);

  useDragDropMonitor({
    onDragEnd(event) {
      if (event.canceled || !event.operation.target) return;

      const sourceId = event.operation.source?.id;
      const targetId = event.operation.target.id;

      if (!sourceId || !targetId) return;

      const targetIdStr = String(targetId);
      const noteId = toNoteId(String(sourceId));

      if (targetIdStr === TRASH_ID) {
        setPendingDeleteNoteId(noteId);

        return;
      }

      if (targetIdStr === UNFILED_ID) {
        void removeAction.execute({ folderId: null, noteId });

        return;
      }

      if (!folders.some((f) => f.id === targetIdStr)) return;

      const folderId = toFolderId(targetIdStr);

      void moveAction.execute({ folderId, noteId });
    },
  });

  const handleConfirmDelete = () => {
    if (!pendingDeleteNoteId) return;

    void deleteAction.execute({ noteId: pendingDeleteNoteId });
  };

  const handleCancelDelete = () => {
    setPendingDeleteNoteId(null);
  };

  if (!mounted || (!isDragging && pathname !== "/notes")) {
    return null;
  }

  return (
    <>
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-6">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-full border bg-background/95 px-4 py-2 shadow-lg backdrop-blur-sm">
            {!isDragging && <AllChip activeFolder={filters.folder} />}
            {folders.map((folder) => {
              return (
                <DropChip
                  activeFolder={filters.folder}
                  folder={folder}
                  isDragging={isDragging}
                  key={folder.id}
                />
              );
            })}
            {isDragging && <UnfiledChip />}
            {isDragging && <TrashChip />}
            {!isDragging && <CreateFolderButton />}
          </div>
        </div>,
        document.body,
      )}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) handleCancelDelete();
        }}
        open={pendingDeleteNoteId !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>delete note</AlertDialogTitle>
            <AlertDialogDescription>
              this action cannot be undone. this note will be permanently
              deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>
              cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteAction.isPending}
              onClick={handleConfirmDelete}
              variant="destructive"
            >
              {deleteAction.isPending ? "deleting..." : "delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
