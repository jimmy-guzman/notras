function rejectionMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error !== null &&
    typeof error === "object" &&
    "kind" in error &&
    typeof error.kind === "string" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
}

/**
 * The reason a rejection carries, or nothing. A caught value is `unknown`, and
 * a Tauri command rejects with whatever Rust returns, so no caller can assume
 * `.message`; a blank one is no reason either.
 */
export function reasonOf(error: unknown) {
  const reason = rejectionMessage(error)?.trim();

  return reason === "" ? undefined : reason;
}
