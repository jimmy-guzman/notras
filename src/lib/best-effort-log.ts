import { error as logError } from "@tauri-apps/plugin-log";

/** Writes `message` to the app's log as an error, and ignores a failure to write it. */
export async function logBestEffort(message: string): Promise<void> {
  try {
    await logError(message);
  } catch {
    // The log is where a failure would be reported, so nothing is left to tell.
  }
}
