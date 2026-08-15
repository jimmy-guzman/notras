import { ManagedRuntime } from "effect";

import { env } from "@/env";
import { NextCacheInvalidatorLive } from "@/server/cache-invalidator";
import { makeAppLayer } from "@/server/services/app-layer";

export const AppRuntime = ManagedRuntime.make(
  makeAppLayer({
    cacheInvalidator: NextCacheInvalidatorLive,
    database: { url: env.DATABASE_PATH },
  }),
);
