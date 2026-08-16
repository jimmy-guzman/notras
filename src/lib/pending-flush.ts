/** Resolves to whether the buffer is safely on disk. */
type Flush = () => Promise<boolean>;

const flushes = new Set<Flush>();

/**
 * Register a buffer's flush so a quit can wait for it. Returns the unregister
 * function -- call it from the effect cleanup.
 */
export function registerPendingFlush(flush: Flush) {
  flushes.add(flush);

  return () => {
    flushes.delete(flush);
  };
}

/**
 * Run every registered flush and report whether all of them landed. Used on
 * quit: the Rust side holds the exit until this resolves, so a debounced
 * buffer is never lost to a ⌘Q -- and a `false` here means quitting would
 * throw the buffer away, so the caller must call it off.
 */
export async function flushPendingWrites() {
  const results = await Promise.allSettled(
    [...flushes].map((flush) => {
      return flush();
    }),
  );

  return results.every((result) => {
    return result.status === "fulfilled" && result.value;
  });
}
