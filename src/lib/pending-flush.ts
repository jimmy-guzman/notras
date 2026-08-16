type Flush = () => Promise<unknown>;

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
 * Run every registered flush. Used on quit: the Rust side holds the exit until
 * this resolves, so a debounced buffer is never lost to a ⌘Q.
 */
export async function flushPendingWrites() {
  await Promise.allSettled(
    [...flushes].map((flush) => {
      return flush();
    }),
  );
}
