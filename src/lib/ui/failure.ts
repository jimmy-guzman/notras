/**
 * The reason a rejection carries, or nothing. TypeScript types a caught value
 * as `unknown` and gives no way to declare what a promise rejects with, so no
 * caller can assume `.message`: `run()` always throws an `Error`, while the
 * Tauri commands the UI calls directly reject with whatever Rust returns. A
 * blank message is no reason either.
 */
export function reasonOf(error: unknown) {
  const reason = error instanceof Error ? error.message.trim() : "";

  return reason === "" ? undefined : reason;
}
