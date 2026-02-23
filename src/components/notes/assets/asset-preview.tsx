"use client";

import { DownloadIcon } from "lucide-react";
import Image from "next/image";

import type { AssetId } from "@/lib/id";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/utils/format";

interface AssetPreviewProps {
  assetId: AssetId;
  fileName: string;
  fileSize: number;
  height: number;
  mimeType: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  width: number;
}

export function AssetPreview({
  assetId,
  fileName,
  fileSize,
  height,
  mimeType,
  onOpenChange,
  open,
  width,
}: AssetPreviewProps) {
  const assetUrl = `/api/assets/${assetId}`;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{fileName}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {mimeType} • {formatFileSize(fileSize)}
          </p>
        </DialogHeader>

        <div className="relative flex max-h-[70vh] items-center justify-center overflow-hidden rounded-lg bg-muted/30">
          <Image
            alt={fileName}
            className="h-auto max-h-[70vh] w-auto max-w-full object-contain"
            height={height}
            src={assetUrl}
            width={width}
          />
        </div>

        <DialogFooter>
          <Button asChild size="sm" variant="outline">
            <a download={fileName} href={assetUrl}>
              <DownloadIcon className="h-4 w-4" />
              download
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
