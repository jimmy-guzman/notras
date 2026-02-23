"use client";

import { DownloadIcon, FileTextIcon, Trash2Icon } from "lucide-react";

import type { Asset } from "@/components/notes/assets/asset-list";
import type { NoteId } from "@/lib/id";

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
import { cn } from "@/lib/ui/utils";
import { formatFileSize } from "@/lib/utils/format";

import { useDeleteAsset } from "./use-delete-asset";

interface PdfListProps {
  mode?: "edit" | "view";
  noteId: NoteId;
  pdfs: Asset[];
}

export function PdfList({ mode = "view", noteId, pdfs }: PdfListProps) {
  const { deletingId, handleDelete, isPending } = useDeleteAsset({
    noteId,
  });

  if (pdfs.length === 0) {
    return null;
  }

  return (
    <div className="divide-y rounded-xl border">
      {pdfs.map((pdf) => {
        const assetUrl = `/api/assets/${pdf.id}`;
        const isDeleting = deletingId === pdf.id;

        return (
          <div
            className={cn(
              "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30",
              isDeleting && "opacity-50",
            )}
            key={pdf.id}
          >
            <FileTextIcon className="h-5 w-5 shrink-0 text-muted-foreground" />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{pdf.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(pdf.fileSize)}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button asChild size="icon-sm" variant="ghost">
                <a download={pdf.fileName} href={assetUrl}>
                  <DownloadIcon className="h-4 w-4" />
                  <span className="sr-only">download</span>
                </a>
              </Button>

              {mode === "edit" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      aria-label="delete pdf"
                      disabled={isPending && isDeleting}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>

                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>delete document</AlertDialogTitle>
                      <AlertDialogDescription>
                        this action cannot be undone. this document will be
                        permanently deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          handleDelete(pdf.id);
                        }}
                        variant="destructive"
                      >
                        delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
