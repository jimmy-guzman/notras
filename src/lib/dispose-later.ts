import { error as logError } from "@tauri-apps/plugin-log";

/**
 * An effect cleanup for Tauri listeners: each `listen` resolves to its own
 * unsubscribe, which runs once the promise settles. A failure is logged, never
 * thrown, so unmounting cannot reject.
 */
export function disposeLater(...pending: Promise<() => void>[]) {
  return () => {
    for (const unlisten of pending) {
      const dispose = async () => {
        try {
          (await unlisten)();
        } catch (error) {
          try {
            await logError(`could not remove a listener: ${String(error)}`);
          } catch {
            // Best effort.
          }
        }
      };

      void dispose();
    }
  };
}
