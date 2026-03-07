"use server";

import { Effect } from "effect";
import { updateTag } from "next/cache";

import type { FolderId, NoteId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { FolderService } from "@/server/services/folder-service";

export async function moveNoteToFolder(
  noteId: NoteId,
  folderId: FolderId | null,
) {
  await serverAction(async (userId) => {
    await AppRuntime.runPromise(
      FolderService.pipe(
        Effect.flatMap((svc) => svc.move(userId, noteId, folderId)),
      ),
    );
  });

  updateTag("folders");
  updateTag("notes");
}
