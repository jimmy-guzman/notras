import { Effect } from "effect";
import { cacheTag } from "next/cache";

import { AppRuntime } from "@/server/layer";
import { FolderService } from "@/server/services/folder-service";
import { UserService } from "@/server/services/user-service";

export async function getFolders() {
  "use cache";

  const userId = await AppRuntime.runPromise(
    UserService.pipe(Effect.flatMap((svc) => svc.getDeviceUserId())),
  );

  const result = await AppRuntime.runPromise(
    FolderService.pipe(Effect.flatMap((svc) => svc.getAll(userId))),
  );

  cacheTag("folders");

  return result;
}
