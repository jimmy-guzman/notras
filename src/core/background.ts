import { Effect } from "effect";

/**
 * Fire-and-forget an effect on the ambient runtime, detached from the calling
 * fiber's scope so it outlives the request that started it. Failures are logged
 * with `label` rather than silently discarded.
 */
export function forkBackground<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  label: string,
) {
  return Effect.forkDaemon(
    effect.pipe(
      Effect.catchAllCause((cause) => {
        return Effect.logError(label, cause);
      }),
    ),
  );
}
