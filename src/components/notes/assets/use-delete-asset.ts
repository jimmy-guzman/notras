"use client";

import { onErrorDeferred, onFinishDeferred } from "@orpc/react";
import { useServerAction } from "@orpc/react/hooks";
import { useState } from "react";
import { toast } from "sonner";

import type { AssetId, NoteId } from "@/lib/id";

import { deleteAsset } from "@/actions/delete-asset";

interface UseDeleteAssetOptions {
  noteId: NoteId;
}

export function useDeleteAsset({ noteId }: UseDeleteAssetOptions) {
  const [deletingId, setDeletingId] = useState<AssetId | null>(null);

  const action = useServerAction(deleteAsset, {
    interceptors: [
      onErrorDeferred(() => {
        toast.error("failed to delete file. please try again.");
      }),
      onFinishDeferred(() => {
        setDeletingId(null);
      }),
    ],
  });

  const handleDelete = (assetId: AssetId) => {
    setDeletingId(assetId);
    void action.execute({ assetId, noteId });
  };

  return { deletingId, handleDelete, isPending: action.isPending };
}
