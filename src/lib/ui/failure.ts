/**
 * The message to show for a rejection, falling back when the value carries no
 * readable one. TypeScript types a caught value as `unknown` and gives no way
 * to declare what a promise rejects with, so no caller can assume `.message`:
 * `run()` always throws an `Error`, while the Tauri commands the UI calls
 * directly reject with whatever Rust returns.
 *
 * Write `fallback` to the copy rules in `DESIGN.md`, since it reaches the user.
 */
export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
