/** A rejection that carries a message, with or without a failure kind. */
export function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  );
}

/** The failure a Tauri command rejects with when Rust returns one. */
export function isNativeFailure(
  error: unknown
): error is { kind: string; message: string } {
  return hasMessage(error) && "kind" in error && typeof error.kind === "string";
}

/** Tauri rejects with a bare string when a command's arguments fail to parse. */
export function isNativeMessage(error: unknown): error is string {
  return typeof error === "string";
}

/** A file failure that distinguishes deletion from an unavailable file. */
export class FileError extends Error {
  readonly kind: "failed" | "not-found";

  constructor(
    failure: { kind: "failed" | "not-found"; message: string },
    options?: ErrorOptions
  ) {
    super(failure.message, options);
    this.name = "FileError";
    this.kind = failure.kind;
  }
}
