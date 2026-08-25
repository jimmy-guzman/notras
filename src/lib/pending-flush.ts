/** Resolves to whether this buffer permits the quit, not to what is on disk. */
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
 * Run every registered flush and report whether the quit may go ahead. Used on
 * quit: the Rust side holds the exit until this resolves, so a debounced buffer
 * is never lost to a ⌘Q -- and a `false` here means a write it could have
 * landed did not, so the caller must call the quit off.
 *
 * True does not mean every buffer is on disk. A buffer whose file has gone
 * reports true while still holding text, because it stopped writing on purpose
 * and blocking on it would leave the app unquittable. Its banner is what tells
 * the user to copy the text out.
 */
export async function flushPendingWrites() {
  const results = await Promise.allSettled(
    [...flushes].map((flush) => flush())
  );

  return results.every(
    (result) => result.status === "fulfilled" && result.value
  );
}
