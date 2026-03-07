"use server";

import { Effect } from "effect";
import { cacheTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { FolderService } from "@/server/services/folder-service";

export async function getFolders() {
  return serverAction(async (userId) => {
    "use cache";

    const result = await AppRuntime.runPromise(
      FolderService.pipe(Effect.flatMap((svc) => svc.getAll(userId))),
    );

    cacheTag("notes");

    return result;
  });
}
