import { error as logError } from "@tauri-apps/plugin-log";

import { FileError, isNativeFailure, isNativeMessage } from "@/core/errors";

/** Preserve expected native failures; log unexpected defects before reporting them. */
export async function nativeCommand<T>(
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      isNativeFailure(error) &&
      (error.kind === "failed" || error.kind === "not-found")
    ) {
      throw new FileError(
        { kind: error.kind, message: error.message },
        { cause: error }
      );
    }
    if (isNativeMessage(error)) {
      throw new FileError({ kind: "failed", message: error }, { cause: error });
    }
    try {
      await logError(
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      );
    } catch {
      // The caller must still receive the failure if the log sink is unavailable.
    }
    throw new Error("an unexpected error", { cause: error });
  }
}
