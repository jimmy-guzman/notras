import { isNativeFailure } from "@/core/errors";

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a caught value is unknown by the language
function rejectionMessage(error: unknown) {
  return error instanceof Error || isNativeFailure(error)
    ? error.message
    : undefined;
}

/**
 * The reason a rejection carries, or nothing. A caught value is `unknown`, and
 * a Tauri command rejects with whatever Rust returns, so no caller can assume
 * `.message`; a blank one is no reason either.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a caught value is unknown by the language
export function reasonOf(error: unknown) {
  const reason = rejectionMessage(error)?.trim();

  return reason === "" ? undefined : reason;
}
