import { error as logError } from "@tauri-apps/plugin-log";
import { FileError } from "@/core/errors";

/** Preserve expected native failures; log unexpected defects before reporting them. */
export async function nativeCommand<T>(
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    if (
      typeof cause === "object" &&
      // biome-ignore lint/suspicious/noUnnecessaryConditions: rejected JavaScript promises can carry null, including malformed IPC failures
      cause !== null &&
      "kind" in cause &&
      (cause.kind === "failed" || cause.kind === "not-found") &&
      "message" in cause &&
      typeof cause.message === "string"
    ) {
      // biome-ignore lint/style/useErrorCause: FileError is a schema constructor without ErrorOptions; the native kind and reason are preserved
      throw new FileError({ kind: cause.kind, message: cause.message });
    }
    if (typeof cause === "string") {
      // biome-ignore lint/style/useErrorCause: FileError is a schema constructor without ErrorOptions; the native kind and reason are preserved
      throw new FileError({ kind: "failed", message: cause });
    }
    try {
      await logError(
        cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)
      );
    } catch {
      // The caller must still receive the failure if the log sink is unavailable.
    }
    throw new Error("an unexpected error", { cause });
  }
}
