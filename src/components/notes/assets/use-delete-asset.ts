"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { AssetId, NoteId } from "@/lib/id";

import { deleteAsset } from "@/actions/delete-asset";

interface UseDeleteAssetOptions {
  noteId: NoteId;
  onDeleted?: () => void;
}

export function useDeleteAsset({ noteId, onDeleted }: UseDeleteAssetOptions) {
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<AssetId | null>(null);

  const handleDelete = (assetId: AssetId) => {
    setDeletingId(assetId);

    startTransition(async () => {
      try {
        const formData = new FormData();

        formData.set("assetId", assetId);
        formData.set("noteId", noteId);

        await deleteAsset(formData);

        onDeleted?.();
      } catch {
        toast.error("failed to delete file. please try again.");
      } finally {
        setDeletingId(null);
      }
    });
  };

  return { deletingId, handleDelete, isPending };
}
