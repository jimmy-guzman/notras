"use client";

import {
  useDragDropMonitor,
  useDragOperation,
  useDroppable,
} from "@dnd-kit/react";
import { usePathname } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import type { FolderWithCount } from "@/server/repositories/folder-repository";

import { moveNoteToFolder } from "@/actions/move-note-to-folder";
import { CreateFolderButton } from "@/components/folders/create-folder-button";
import { DeleteFolderButton } from "@/components/folders/delete-folder-button";
import { RenameFolderButton } from "@/components/folders/rename-folder-button";
import { toFolderId, toNoteId } from "@/lib/id";
import { parsers } from "@/lib/notes-search-params";
import { cn } from "@/lib/ui/utils";

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
      <button
        className="text-sm font-medium"
        onClick={handleClick}
        type="button"
      >
        {folder.name}
        {!isDragging && (
          <span className="ml-1.5 text-xs text-muted-foreground">
            {folder.noteCount}
          </span>
        )}
      </button>
      {!isDragging && (
        <div className="ml-1 flex max-w-0 items-center gap-0.5 overflow-hidden opacity-0 transition-[max-width,opacity] duration-150 group-hover:max-w-[5rem] group-hover:opacity-100">
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
    <button
      className={cn(
        "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
        isActive
          ? "border-primary bg-primary/10"
          : "border-border bg-background hover:border-primary/50",
      )}
      onClick={handleClick}
      type="button"
    >
      all
    </button>
  );
}

interface FolderPanelProps {
  folders: FolderWithCount[];
}

export function FolderPanel({ folders }: FolderPanelProps) {
  const [filters] = useQueryStates(parsers);
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const { source } = useDragOperation();
  const isDragging = Boolean(source);

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

      const noteId = toNoteId(String(sourceId));
      const folderId = toFolderId(String(targetId));

      startTransition(async () => {
        try {
          await moveNoteToFolder(noteId, folderId);
          toast.success("note moved to folder");
        } catch {
          toast.error("failed to move note. please try again.");
        }
      });
    },
  });

  if (!mounted || (!isDragging && pathname !== "/notes")) {
    return null;
  }

  return createPortal(
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
        {!isDragging && <CreateFolderButton />}
      </div>
    </div>,
    document.body,
  );
}
