"use server";

import { Effect } from "effect";
import { cacheTag } from "next/cache";

import { serverAction } from "@/lib/authorized";
import { AppRuntime } from "@/server/layer";
import { TagService } from "@/server/services/tag-service";

export async function getTags() {
  return serverAction(async (userId) => {
    "use cache";

    const result = await AppRuntime.runPromise(
      TagService.pipe(Effect.flatMap((svc) => svc.getAllTags(userId))),
    );

    cacheTag("notes", "tags");

    return result;
  });
}
