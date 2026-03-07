"use server";

import { Effect, Schema } from "effect";
import { updateTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { createFolderSchema } from "@/server/schemas/folder-schemas";
import { FolderService } from "@/server/services/folder-service";

export async function createFolder(formData: FormData) {
  const { name } = Schema.decodeUnknownSync(createFolderSchema)({
    name: formData.get("name"),
  });

  await serverAction(async (userId) => {
    await AppRuntime.runPromise(
      FolderService.pipe(Effect.flatMap((svc) => svc.create(userId, name))),
    );
  });

  updateTag("folders");
}
