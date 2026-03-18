"use client";

import type { ChangeEvent, DragEvent } from "react";

import { PaperclipIcon, UploadIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { NoteId } from "@/lib/id";

import { uploadAssets } from "@/actions/upload-assets";
import { cn } from "@/lib/ui/utils";

interface AssetUploaderProps {
  noteId: NoteId;
}

export function AssetUploader({ noteId }: AssetUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const action = useAction(uploadAssets, {
    onError: () => {
      toast.error("failed to upload files. please try again.");
    },
    onSuccess: () => {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
  });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = [...files];

    action.execute({ files: fileArray, noteId });
  };

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const { files } = e.dataTransfer;

    handleFiles(files);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <input
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf"
        className="hidden"
        disabled={action.isPending}
        multiple
        onChange={handleFileInput}
        ref={fileInputRef}
        type="file"
      />

      <button
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card p-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
          action.isPending && "pointer-events-none opacity-50",
        )}
        disabled={action.isPending}
        onClick={handleClick}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        type="button"
      >
        {action.isPending ? (
          <>
            <UploadIcon className="h-8 w-8 animate-pulse text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">uploading files...</p>
              <p className="text-xs text-muted-foreground">
                this may take a moment
              </p>
            </div>
          </>
        ) : (
          <>
            <PaperclipIcon className="h-8 w-8 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                drop files here or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                images and pdfs (max 10mb each)
              </p>
            </div>
          </>
        )}
      </button>
    </div>
  );
}
