import { Schema } from "effect";

/**
 * Whether the file was not there, or the operation failed for some other
 * reason. A tab treats the first as a deletion and keeps its buffer through the
 * second, so the two cannot share one shape (`D55`).
 */
export const FileErrorKind = Schema.Literals(["failed", "not-found"]);

export class FileError extends Schema.TaggedError<FileError>()("FileError", {
  kind: FileErrorKind,
  message: Schema.String,
}) {}
