"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { AssetId, NoteId } from "@/lib/id";

import { deleteAsset } from "@/actions/delete-asset";

interface UseDeleteAssetOptions {
  noteId: NoteId;
}

export function useDeleteAsset({ noteId }: UseDeleteAssetOptions) {
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<AssetId | null>(null);

  const handleDelete = (assetId: AssetId) => {
    setDeletingId(assetId);

    startTransition(async () => {
      try {
        const [error] = await deleteAsset({ assetId, noteId });

        if (error) {
          toast.error("failed to delete file. please try again.");
        }
      } finally {
        setDeletingId(null);
      }
    });
  };

  return { deletingId, handleDelete, isPending };
}
