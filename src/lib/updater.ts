import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

import { flushPendingWrites } from "@/lib/pending-flush";

/**
 * Whether this build can reach the updater at all. The endpoint that
 * `latest.json` is published to only answers for a release, so a development
 * build has nothing to ask and no bundle to replace.
 */
export function updatesSupported() {
  return import.meta.env.PROD;
}

/**
 * Ask the release endpoint whether a newer version exists. Resolves to `null`
 * when the app is current. Call it only when `updatesSupported()` holds.
 *
 * The resolved `Update` owns a native handle. Hand it to `installUpdate`, which
 * consumes it, or call its `close()` to let it go. A handle that is neither is
 * released when the app exits, which bounds the leak at one per check.
 */
export async function findUpdate() {
  return await check();
}

/**
 * Download the update, install it, and restart into it. Does not resolve on the
 * happy path: `relaunch` replaces the process.
 *
 * Throws when a buffer could not be written, which leaves the app running on
 * the installed bundle: it takes effect the next time someone launches it.
 */
export async function installUpdate(update: Update) {
  await update.downloadAndInstall();

  // Tauri ignores `prevent_exit` for a restart, so Rust cannot hold this one
  // open for the quit handshake the way it holds a ⌘Q. Flushing here is what
  // keeps the last keystrokes from dying with the old process.
  if (!(await flushPendingWrites())) {
    throw new Error(
      "could not save your changes: the update will apply on next launch"
    );
  }

  await relaunch();
}
