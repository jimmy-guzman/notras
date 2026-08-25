/** Resolves to whether quitting would lose anything from this buffer. */
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
 *
 * A buffer whose file has gone reports true while holding text, because it has
 * stopped writing on purpose and blocking on it would leave the app
 * unquittable. Its banner is what tells the user to copy the text out.
 */
export async function flushPendingWrites() {
  const results = await Promise.allSettled(
    [...flushes].map((flush) => flush())
  );

  return results.every(
    (result) => result.status === "fulfilled" && result.value
  );
}
