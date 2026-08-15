import type { Effect } from "effect";

import { Context } from "effect";

export interface ICacheInvalidator {
  /** Invalidate every cache entry associated with `tag`. */
  invalidate: (tag: string) => Effect.Effect<void>;
}

/**
 * Framework-agnostic cache invalidation boundary. The web app backs this with
 * `updateTag` from `next/cache`; other runtimes supply their own.
 */
export class CacheInvalidator extends Context.Tag("CacheInvalidator")<
  CacheInvalidator,
  ICacheInvalidator
>() {}
