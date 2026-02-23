"use client";

import { Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import type { AssetId, NoteId } from "@/lib/id";

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

import { AssetPreview } from "./asset-preview";
import { useDeleteAsset } from "./use-delete-asset";

export interface Asset {
  fileName: string;
  fileSize: number;
  height: number;
  id: AssetId;
  mimeType: string;
  width: number;
}

interface AssetListProps {
  assets: Asset[];
  mode?: "edit" | "view";
  noteId: NoteId;
  onAssetDeleted?: () => void;
}

export function AssetList({
  assets,
  mode = "view",
  noteId,
  onAssetDeleted,
}: AssetListProps) {
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const { deletingId, handleDelete, isPending } = useDeleteAsset({
    noteId,
    onDeleted: onAssetDeleted,
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {assets.map((asset, index) => {
          const assetUrl = `/api/assets/${asset.id}`;
          const isDeleting = deletingId === asset.id;

          return (
            <div
              className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-foreground/10 transition-all hover:shadow-lg"
              key={asset.id}
            >
              <button
                aria-label={`preview ${asset.fileName}`}
                className="absolute inset-0 w-full"
                disabled={isDeleting}
                onClick={() => {
                  setPreviewAsset(asset);
                }}
                type="button"
              >
                <Image
                  alt={asset.fileName}
                  className={cn(
                    "h-full w-full object-cover transition-opacity",
                    isDeleting && "opacity-50",
                  )}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                  src={assetUrl}
                />
              </button>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-linear-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="truncate text-xs font-medium text-white">
                  {asset.fileName}
                </p>
                <p className="text-xs text-white/80">
                  {formatFileSize(asset.fileSize)}
                </p>
              </div>

              {mode === "edit" && (
                <div className="absolute top-2 right-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        aria-label="delete image"
                        className="pointer-events-auto h-8 w-8 bg-black/80 hover:bg-black"
                        disabled={isPending && isDeleting}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Trash2Icon className="h-3 w-3 text-white" />
                      </Button>
                    </AlertDialogTrigger>

                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>delete image</AlertDialogTitle>
                        <AlertDialogDescription>
                          this action cannot be undone. this image will be
                          permanently deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            handleDelete(asset.id);
                          }}
                          variant="destructive"
                        >
                          delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {previewAsset && (
        <AssetPreview
          assetId={previewAsset.id}
          fileName={previewAsset.fileName}
          fileSize={previewAsset.fileSize}
          height={previewAsset.height}
          mimeType={previewAsset.mimeType}
          onOpenChange={(open) => {
            if (!open) setPreviewAsset(null);
          }}
          open
          width={previewAsset.width}
        />
      )}
    </>
  );
}
