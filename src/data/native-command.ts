import { FileError, isNativeFailure, isNativeMessage } from "@/core/errors";
import { logBestEffort } from "@/lib/best-effort-log";

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

    await logBestEffort(
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    );

    throw new Error("An unexpected error", { cause: error });
  }
}
