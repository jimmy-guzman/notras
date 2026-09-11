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
