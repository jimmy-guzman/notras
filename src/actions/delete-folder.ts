"use server";

import { Effect } from "effect";
import { updateTag } from "next/cache";

import type { FolderId } from "@/lib/id";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { FolderService } from "@/server/services/folder-service";

export async function deleteFolder(folderId: FolderId) {
  await serverAction(async (userId) => {
    await AppRuntime.runPromise(
      FolderService.pipe(Effect.flatMap((svc) => svc.delete(userId, folderId))),
    );
  });

  updateTag("folders");
  updateTag("notes");
}
