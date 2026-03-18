"use client";

import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";

import type { AssetId, NoteId } from "@/lib/id";

import { deleteAsset } from "@/actions/delete-asset";

interface UseDeleteAssetOptions {
  noteId: NoteId;
}

export function useDeleteAsset({ noteId }: UseDeleteAssetOptions) {
  const [deletingId, setDeletingId] = useState<AssetId | null>(null);

  const action = useAction(deleteAsset, {
    onError: () => {
      toast.error("failed to delete file. please try again.");
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const handleDelete = (assetId: AssetId) => {
    setDeletingId(assetId);
    action.execute({ assetId, noteId });
  };

  return { deletingId, handleDelete, isPending: action.isPending };
}
