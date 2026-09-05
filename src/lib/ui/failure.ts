/**
 * The reason a rejection carries, or nothing. A caught value is `unknown`, and
 * a Tauri command rejects with whatever Rust returns, so no caller can assume
 * `.message`; a blank one is no reason either.
 */
export function reasonOf(error: unknown) {
  const reason = error instanceof Error ? error.message.trim() : "";

  return reason === "" ? undefined : reason;
}
