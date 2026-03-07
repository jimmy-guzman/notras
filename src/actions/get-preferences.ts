"use server";

import { Effect } from "effect";
import { cacheTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { UserService } from "@/server/services/user-service";

export async function getPreferences() {
  return serverAction(async (userId) => {
    "use cache";

    const result = await AppRuntime.runPromise(
      UserService.pipe(Effect.flatMap((svc) => svc.getPreferences(userId))),
    );

    cacheTag("preferences");

    return result;
  });
}
