import { logBestEffort } from "./best-effort-log";

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
          await logBestEffort(`could not remove a listener: ${String(error)}`);
        }
      };

      void dispose();
    }
  };
}
