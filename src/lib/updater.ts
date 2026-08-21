import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

/**
 * Ask the release endpoint whether a newer version exists. Resolves to `null`
 * when the app is current, and always in development, where the endpoint that
 * `latest.json` is published to does not answer.
 *
 * The resolved `Update` owns a native handle. Hand it to `installUpdate`, which
 * consumes it, or call its `close()` to let it go. A handle that is neither is
 * released when the app exits, which bounds the leak at one per check.
 */
export async function findUpdate() {
  if (!import.meta.env.PROD) {
    return null;
  }

  return await check();
}

/**
 * Download the update, install it, and restart into it. Does not resolve on the
 * happy path: `relaunch` replaces the process.
 */
export async function installUpdate(update: Update) {
  await update.downloadAndInstall();
  await relaunch();
}
