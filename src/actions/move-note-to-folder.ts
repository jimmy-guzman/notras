"use server";

import { updateTag } from "next/cache";

import type { FolderId, NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { getFolderService } from "@/server/services/folder-service";

export async function moveNoteToFolder(
  noteId: NoteId,
  folderId: FolderId | null,
) {
  await serverAction(async (userId) => {
    await getFolderService().move(userId, noteId, folderId);
  });

  updateTag("folders");
  updateTag("notes");
}
