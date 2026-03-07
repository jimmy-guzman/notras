"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { toFolderId } from "@/lib/id";
import { AppRuntime } from "@/server/layer";
import { renameFolderSchema } from "@/server/schemas/folder-schemas";
import { FolderService } from "@/server/services/folder-service";

export async function renameFolder(formData: FormData) {
  const { folderId: folderIdRaw, name } = Schema.decodeUnknownSync(
    renameFolderSchema,
  )({
    folderId: formData.get("folderId"),
    name: formData.get("name"),
  });

  const folderId = toFolderId(folderIdRaw);

  await serverAction(async (userId) => {
    await AppRuntime.runPromise(
      FolderService.pipe(
        Effect.flatMap((svc) => svc.rename(userId, folderId, name)),
      ),
    );
  });

  updateTag("folders");
  updateTag("notes");
}
