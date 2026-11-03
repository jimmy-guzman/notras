import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";

import { toast } from "@/components/ui/toast";
import { reasonOf } from "@/lib/ui/failure";
import { commands } from "@/server/adapters/bindings";

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
 * Download the update, install it, and restart into it once every window has
 * saved, through the same handshake as a quit. A buffer that cannot be written
 * calls the restart off, and the bundle already downloaded applies the next
 * time someone launches it.
 */
async function installUpdate(update: Update) {
  await update.downloadAndInstall();
  await commands.restartApp();
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

  const install = async (offer: string) => {
    try {
      await installUpdate(update);
    } catch (error) {
      toast.add({
        description: reasonOf(error),
        title: "could not install the update",
        type: "error",
      });
    }

    // Closing the offer runs `release` through `onClose`, so it waits until
    // `installUpdate` is done with the handle. Left open after a restart
    // begins, a second install would download again.
    toast.close(offer);
  };

  const id = toast.add({
    actionProps: {
      children: "install",
      onClick: () => {
        void install(id);
      },
    },
    onClose: () => {
      void release();
    },
    timeout: 0,
    title: `version ${update.version} is available`,
    type: "info",
  });
}
