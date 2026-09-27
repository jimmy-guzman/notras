/** Resolves to whether this buffer permits the quit, not to what is on disk. */
type Flush = () => Promise<boolean>;

const flushes = new Set<Flush>();

/** Add a buffer's flush to the set `flushPendingWrites` runs; returns its unregister. */
export function registerPendingFlush(flush: Flush) {
  flushes.add(flush);

  return () => {
    flushes.delete(flush);
  };
}

/**
 * Run every registered flush and report whether all of them permit the quit. A
 * `false` means a write it could have landed did not, so the caller must call
 * off whatever needed the buffers on disk.
 *
 * True does not mean every buffer is on disk. A buffer whose file has gone
 * reports true while still holding text, because it stopped writing on purpose
 * and blocking on it would leave the app unquittable. Its banner is what tells
 * the user to copy the text out.
 */
export async function flushPendingWrites() {
  const results = await Promise.allSettled(
    [...flushes].map(async (flush) => await flush())
  );

  return results.every(
    (result) => result.status === "fulfilled" && result.value
  );
}
