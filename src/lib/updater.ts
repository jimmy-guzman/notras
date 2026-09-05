import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { toast } from "@/components/ui/toast";
import { flushPendingWrites } from "@/lib/pending-flush";
import { reasonOf } from "@/lib/ui/failure";

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
 * The resolved `Update` owns a native handle that nothing on the Rust side
 * releases, `download_and_install` included. Hand it to `offerUpdate`, which
 * owns it from there.
 */
export async function findUpdate() {
  return await check();
}

/**
 * Download the update, install it, and restart into it. Does not resolve on the
 * happy path: `relaunch` replaces the process.
 *
 * Throws when a buffer could not be written. The app keeps running the old
 * version rather than restarting, and the bundle already downloaded applies the
 * next time someone launches it.
 */
async function installUpdate(update: Update) {
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

/**
 * Offer the update, and own its handle until the offer ends. The toast waits
 * for an answer rather than expiring: dismissing it is how someone says no, and
 * the default five seconds is easy to miss.
 */
export function offerUpdate(update: Update) {
  // Nothing on the Rust side releases this one, so the offer has to. A failed
  // close leaves a resource the process drops on exit, which is not worth
  // interrupting anyone over.
  const release = async () => {
    try {
      await update.close();
    } catch {
      // See above: not worth interrupting anyone over.
    }
  };

  const id = toast.add({
    actionProps: {
      children: "install",
      onClick: async () => {
        try {
          await installUpdate(update);
        } catch (error) {
          // Closing the offer runs `release` through `onClose`, so the failure
          // path must not free the handle itself, and must not close before
          // `installUpdate` is done with it.
          toast.close(id);
          toast.add({
            description: reasonOf(error),
            title: "could not install the update",
            type: "error",
          });
        }
      },
    },
    onClose: release,
    timeout: 0,
    title: `version ${update.version} is available`,
  });
}
