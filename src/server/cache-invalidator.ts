import { Effect, Layer } from "effect";
import { updateTag } from "next/cache";

import { CacheInvalidator } from "@/core";

export const NextCacheInvalidatorLive = Layer.succeed(CacheInvalidator, {
  invalidate: (tag: string) => {
    return Effect.sync(() => {
      updateTag(tag);
    });
  },
});
